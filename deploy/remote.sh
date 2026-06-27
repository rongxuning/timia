#!/usr/bin/env bash
# Remote deploy from dev machine: build images locally, upload to server.
#   bash deploy/remote.sh          # pack + upload
#   bash deploy/remote.sh pack     # build images → deploy/dist/timia-images.tar.gz
#   bash deploy/remote.sh upload   # scp bundle and install on server
#
# Env: SKIP_BUILD=1     — pack existing timia-*:prod images (skip docker compose build)
#      PACK_NO_CACHE=1   — force full rebuild (ignore layer cache)
#      PACK_SERVICES=web|core-service|all  (default: all; use web when only frontend changed)
#      PACK_ENV=.env.pack  SSH_HOST  SSH_USER  DEPLOY_PATH=/opt/timia
#      REMOTE_TAR=timia-images.tar.gz  (remote $HOME, not /tmp)
#      SSH_IDENTITY_FILE=~/.ssh/your.pem
#      GIT_REF=release/v1.0.0  (default: current local branch)
#      SKIP_GIT_SYNC=1  — upload: skip server git sync (images only)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT"

CMD="${1:-all}"
PACK_ENV="${PACK_ENV:-.env.pack}"
OUT_DIR="${OUT_DIR:-deploy/dist}"
OUT_FILE="${OUT_FILE:-$OUT_DIR/timia-images.tar.gz}"
BUNDLE="${BUNDLE:-$OUT_FILE}"
SSH_HOST="${SSH_HOST:-}"
SSH_USER="${SSH_USER:-}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/timia}"
REMOTE_TAR="${REMOTE_TAR:-timia-images.tar.gz}"
export DOCKER_DEFAULT_PLATFORM="${DOCKER_DEFAULT_PLATFORM:-linux/amd64}"

timia_ssh() {
  if [[ -n "${SSH_IDENTITY_FILE:-}" ]]; then
    ssh -i "$SSH_IDENTITY_FILE" "${SSH_USER}@${SSH_HOST}" "$@"
  else
    ssh "${SSH_USER}@${SSH_HOST}" "$@"
  fi
}

timia_scp() {
  if [[ -n "${SSH_IDENTITY_FILE:-}" ]]; then
    scp -i "$SSH_IDENTITY_FILE" "$@"
  else
    scp "$@"
  fi
}

timia_pull_image() {
  local image="$1"
  if docker image inspect "$image" >/dev/null 2>&1; then
    echo "Image present: $image"
    return 0
  fi

  echo "Pulling $image ..."
  if docker pull "$image" 2>/dev/null; then
    return 0
  fi

  local prefix mirror_image
  for prefix in \
    docker.m.daocloud.io/library \
    mirror.ccs.tencentyun.com/library; do
    mirror_image="${prefix}/${image}"
    echo "Docker Hub unreachable, trying mirror: $mirror_image"
    if docker pull "$mirror_image"; then
      docker tag "$mirror_image" "$image"
      echo "Tagged $mirror_image -> $image"
      return 0
    fi
  done

  echo "Failed to pull $image from Docker Hub and mirrors." >&2
  echo "If timia-*:prod images already exist locally, retry with: SKIP_BUILD=1 bash deploy/remote.sh pack" >&2
  return 1
}

timia_compose_build() {
  local service="$1"
  if [[ "${PACK_NO_CACHE:-0}" == "1" ]]; then
    docker compose --progress plain \
      -f docker-compose.prod.yml --env-file "$PACK_ENV" \
      build --no-cache "$service"
  else
    docker compose --progress plain \
      -f docker-compose.prod.yml --env-file "$PACK_ENV" \
      build "$service"
  fi
}

timia_verify_web_api_url() {
  local expected="$1"
  local image="${2:-timia-web:prod}"
  echo "Verifying ${image} bakes NEXT_PUBLIC_API_BASE_URL=${expected} ..."

  # Match wrong API base URL only (not Next.js relative routes like /api/documents).
  if docker run --rm "$image" \
    sh -c "grep -roh 'https://timia.online/api[^a-z-]' /app/.next 2>/dev/null | grep -q ."; then
    echo "FAIL ${image} still contains https://timia.online/api (wrong path)" >&2
    docker run --rm "$image" \
      sh -c "grep -roh 'https://timia.online[^\"'\'' ]*' /app/.next 2>/dev/null | sort -u | head -5" >&2 || true
    return 1
  fi

  if docker run --rm "$image" \
    sh -c "grep -rqF '${expected}' /app/.next 2>/dev/null"; then
    echo "OK  ${image} contains ${expected}"
    return 0
  fi

  echo "FAIL ${image} missing ${expected} — rebuild with: PACK_NO_CACHE=1 bash deploy/remote.sh pack" >&2
  docker run --rm "$image" \
    sh -c "grep -roh 'https://timia.online[^\"'\'' ]*' /app/.next 2>/dev/null | sort -u | head -5" >&2 || true
  return 1
}

timia_print_built_images() {
  local img
  echo "Built images:"
  for img in timia-core-service:prod timia-web:prod; do
    docker images "$img" --format 'table {{.Repository}}\t{{.Tag}}\t{{.ID}}\t{{.CreatedSince}}'
  done
}

pack() {
  if [[ ! -f "$PACK_ENV" ]]; then
    echo "Create $PACK_ENV from .env.pack.example" >&2
    exit 1
  fi

  set -a
  # shellcheck disable=SC1090
  source "$PACK_ENV"
  set +a

  export TIMIA_ENV_FILE="$(cd "$(dirname "$PACK_ENV")" && pwd)/$(basename "$PACK_ENV")"
  mkdir -p "$OUT_DIR"

  if [[ -z "${NEXT_PUBLIC_API_BASE_URL:-}" ]]; then
    echo "NEXT_PUBLIC_API_BASE_URL is not set in $PACK_ENV" >&2
    exit 1
  fi
  if [[ "$NEXT_PUBLIC_API_BASE_URL" == */api ]]; then
    echo "WARN: NEXT_PUBLIC_API_BASE_URL ends with /api — production nginx expects /core-service" >&2
  fi
  echo "Pack env: NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}"

  if [[ "${SKIP_BUILD:-0}" == "1" ]]; then
    for img in timia-core-service:prod timia-web:prod; do
      if ! docker image inspect "$img" >/dev/null 2>&1; then
        echo "SKIP_BUILD=1 but missing image: $img" >&2
        exit 1
      fi
    done
    echo "SKIP_BUILD=1 — packing existing timia-core-service:prod and timia-web:prod"
    timia_verify_web_api_url "$NEXT_PUBLIC_API_BASE_URL"
  else
    export CORE_SERVICE_REVISION="$(git rev-parse HEAD:codes/core-service 2>/dev/null || echo local)"
    # Include API base URL so changing .env.pack always invalidates web build cache.
    export WEB_REVISION="$(git rev-parse HEAD:codes/web 2>/dev/null || echo local)-api-${NEXT_PUBLIC_API_BASE_URL}"

    echo "Pulling base images (platform=$DOCKER_DEFAULT_PLATFORM) ..."
    pack_services="${PACK_SERVICES:-all}"

    build_service() {
      case "$pack_services" in
        all|"$1") return 0 ;;
        *) return 1 ;;
      esac
    }

    if build_service core-service; then
      timia_pull_image python:3.12-slim
      echo "Building core-service (revision=${CORE_SERVICE_REVISION}) ..."
      timia_compose_build core-service
    else
      echo "Skip core-service build (PACK_SERVICES=${pack_services})"
      docker image inspect timia-core-service:prod >/dev/null 2>&1 || {
        echo "timia-core-service:prod missing — use PACK_SERVICES=all or build core-service first" >&2
        exit 1
      }
    fi

    if build_service web; then
      timia_pull_image node:22-alpine
      echo "Building web (revision=${WEB_REVISION}) ..."
      timia_compose_build web
      timia_verify_web_api_url "$NEXT_PUBLIC_API_BASE_URL"
    else
      echo "Skip web build (PACK_SERVICES=${pack_services})"
      docker image inspect timia-web:prod >/dev/null 2>&1 || {
        echo "timia-web:prod missing — use PACK_SERVICES=all or build web first" >&2
        exit 1
      }
    fi

    timia_print_built_images
  fi

  local web_id core_id
  web_id="$(docker image inspect timia-web:prod --format '{{.Id}}')"
  core_id="$(docker image inspect timia-core-service:prod --format '{{.Id}}')"
  echo "Saving images to $OUT_FILE ..."
  echo "  timia-web:prod         ${web_id}"
  echo "  timia-core-service:prod ${core_id}"
  docker save timia-core-service:prod timia-web:prod | gzip > "$OUT_FILE"
  ls -lh "$OUT_FILE"
  echo "Pack done. Upload with: bash deploy/remote.sh upload"
}

upload() {
  if [[ -z "$SSH_HOST" || -z "$SSH_USER" ]]; then
    echo "Set SSH_HOST and SSH_USER before upload." >&2
    exit 1
  fi

  if [[ ! -f "$BUNDLE" ]]; then
    echo "Missing bundle: $BUNDLE — run: bash deploy/remote.sh pack" >&2
    exit 1
  fi

  local git_ref="${GIT_REF:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)}"
  local skip_git_sync="${SKIP_GIT_SYNC:-0}"

  echo "Uploading $BUNDLE -> ${SSH_USER}@${SSH_HOST}:~/${REMOTE_TAR}"
  timia_ssh "rm -f ~/${REMOTE_TAR} /tmp/${REMOTE_TAR}"
  timia_scp "$BUNDLE" "${SSH_USER}@${SSH_HOST}:${REMOTE_TAR}"

  if [[ "$skip_git_sync" == "1" ]]; then
    echo "Installing on server (SKIP_GIT_SYNC=1, images only) ..."
  else
    echo "Installing on server (git ref: ${git_ref}) ..."
  fi
  timia_ssh "set -euo pipefail
    cd ${DEPLOY_PATH}
    if [[ ${skip_git_sync} -ne 1 ]]; then
      git fetch origin ${git_ref}
      git checkout -fB ${git_ref} origin/${git_ref}
    fi
    if [[ ! -f deploy/dc.sh ]]; then
      echo 'deploy/dc.sh missing — run upload without SKIP_GIT_SYNC or sync ${git_ref} on server' >&2
      exit 1
    fi
    gunzip -c ~/${REMOTE_TAR} | docker load
    bash deploy/dc.sh up -d --no-build --force-recreate core-service web
    bash deploy/dc.sh up -d
    if docker run --rm timia-web:prod sh -c \"grep -roh 'https://timia.online/api[^a-z-]' /app/.next 2>/dev/null | grep -q .\"; then
      echo 'ERROR: deployed web image still uses /api — repack (ensure pack shows Saving images) and re-upload' >&2
      exit 1
    fi
    rm -f ~/${REMOTE_TAR} /tmp/${REMOTE_TAR}
  "

  echo "Done. Check: curl -fsS https://timia.online/core-service/health"
}

case "$CMD" in
  pack) pack ;;
  upload) upload ;;
  all)
    pack
    upload
    ;;
  -h|--help)
    sed -n '2,6p' "$0"
    ;;
  *)
    echo "Unknown command: $CMD (use pack|upload|all)" >&2
    exit 2
    ;;
esac
