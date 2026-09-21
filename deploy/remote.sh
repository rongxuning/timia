#!/usr/bin/env bash
# Remote deploy from dev machine: detect changed services → parallel build →
# per-service pack/upload (skip unchanged).
#
#   bash deploy/remote.sh              # plan + pack + upload (smart)
#   bash deploy/remote.sh plan         # only print deploy checklist
#   bash deploy/remote.sh pack         # build+save only changed (or PACK_SERVICES)
#   bash deploy/remote.sh upload       # upload packed service tarballs
#
# Env:
#   PACK_SERVICES=smart|all|web|core-service|file-service|mcp-server|comma-list
#                  (default: smart — compare against server HEAD / DEPLOY_BASE)
#   DEPLOY_BASE=<sha>   — base revision for smart detect (skip SSH probe)
#   SKIP_BUILD=1        — pack existing local prod images (no compose build)
#   PACK_NO_CACHE=1     — force full rebuild
#   PACK_ENV=.env.pack
#   GIT_REF=main        — remote git checkout target (default: current branch)
#   SKIP_GIT_SYNC=1     — upload: skip server git sync
#   PARALLEL_UPLOAD=1   — upload/load services in parallel (default: 1)
#   SSH_IDENTITY_FILE / SSH_HOST / SSH_USER / DEPLOY_PATH
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=_common.sh
source "$SCRIPT_DIR/_common.sh"
cd "$ROOT"

CMD="${1:-all}"
PACK_ENV="${PACK_ENV:-.env.pack}"
OUT_DIR="${OUT_DIR:-deploy/dist}"
REMOTE_TAR_PREFIX="${REMOTE_TAR_PREFIX:-timia}"
export DOCKER_DEFAULT_PLATFORM="${DOCKER_DEFAULT_PLATFORM:-linux/amd64}"
PARALLEL_UPLOAD="${PARALLEL_UPLOAD:-1}"

_timia_saved_ssh_host="${SSH_HOST:-}"
_timia_saved_ssh_user="${SSH_USER:-}"
_timia_saved_ssh_identity="${SSH_IDENTITY_FILE:-}"
_timia_saved_deploy_path="${DEPLOY_PATH:-}"
if [[ -f "$PACK_ENV" ]]; then
  set -a
  # shellcheck disable=SC1090
  source "$PACK_ENV"
  set +a
fi
SSH_HOST="${_timia_saved_ssh_host:-${SSH_HOST:-}}"
SSH_USER="${_timia_saved_ssh_user:-${SSH_USER:-}}"
SSH_IDENTITY_FILE="${_timia_saved_ssh_identity:-${SSH_IDENTITY_FILE:-}}"
DEPLOY_PATH="${_timia_saved_deploy_path:-${DEPLOY_PATH:-/opt/timia}}"

timia_ssh() {
  local opts=(-o ServerAliveInterval=15 -o ServerAliveCountMax=20 -o ConnectTimeout=20 -o BatchMode=yes)
  if [[ -n "${SSH_IDENTITY_FILE:-}" ]]; then
    ssh "${opts[@]}" -i "$SSH_IDENTITY_FILE" "${SSH_USER}@${SSH_HOST}" "$@"
  else
    ssh "${opts[@]}" "${SSH_USER}@${SSH_HOST}" "$@"
  fi
}

timia_scp() {
  local opts=(-o ServerAliveInterval=15 -o ServerAliveCountMax=20 -o ConnectTimeout=20 -o BatchMode=yes)
  if [[ -n "${SSH_IDENTITY_FILE:-}" ]]; then
    scp "${opts[@]}" -i "$SSH_IDENTITY_FILE" "$@"
  else
    scp "${opts[@]}" "$@"
  fi
}

timia_service_tar() {
  echo "${OUT_DIR}/timia-${1}.tar.gz"
}

timia_manifest_path() {
  echo "${OUT_DIR}/timia-pack.manifest"
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

  if docker run --rm "$image" \
    sh -c "grep -roh 'https://timia.online/api[^a-z-]' /app/.next 2>/dev/null | grep -q ."; then
    echo "FAIL ${image} still contains https://timia.online/api (wrong path)" >&2
    return 1
  fi

  if docker run --rm "$image" \
    sh -c "grep -rqF '${expected}' /app/.next 2>/dev/null"; then
    echo "OK  ${image} contains ${expected}"
    return 0
  fi

  echo "FAIL ${image} missing ${expected} — rebuild with: PACK_NO_CACHE=1 bash deploy/remote.sh pack" >&2
  return 1
}

timia_probe_server_head() {
  if [[ -n "${DEPLOY_BASE:-}" ]]; then
    echo "$DEPLOY_BASE"
    return 0
  fi
  if [[ -z "${SSH_HOST:-}" || -z "${SSH_USER:-}" ]]; then
    return 1
  fi
  timia_ssh "cd ${DEPLOY_PATH} && git rev-parse HEAD" 2>/dev/null
}

timia_require_pack_env() {
  if [[ ! -f "$PACK_ENV" ]]; then
    echo "Create $PACK_ENV from .env.pack.example" >&2
    exit 1
  fi
  if [[ -z "${NEXT_PUBLIC_API_BASE_URL:-}" ]]; then
    echo "NEXT_PUBLIC_API_BASE_URL is not set in $PACK_ENV" >&2
    exit 1
  fi
  if [[ "$NEXT_PUBLIC_API_BASE_URL" == */api ]]; then
    echo "WARN: NEXT_PUBLIC_API_BASE_URL ends with /api — production nginx expects /core-service" >&2
  fi
}

# Sets globals: SELECTED_SERVICES (array), BASE_SHA, SELECTOR
timia_select_services() {
  local selector="${PACK_SERVICES:-smart}"
  local base_sha="" head_sha
  head_sha="$(git rev-parse HEAD)"
  SELECTOR="$selector"

  if [[ "$selector" == smart ]]; then
    if ! base_sha="$(timia_probe_server_head)"; then
      echo "WARN: cannot probe server HEAD for smart detect; falling back to PACK_SERVICES=all" >&2
      echo "      Set DEPLOY_BASE=<sha> or PACK_SERVICES=web,core-service,... to override." >&2
      selector=all
      SELECTOR=all
    else
      BASE_SHA="$base_sha"
      echo "Smart base (server/DEPLOY_BASE): ${base_sha:0:7}"
      echo "Smart head (local):             ${head_sha:0:7}"
      if [[ "$base_sha" != "$head_sha" ]]; then
        echo "Changed files:"
        git diff --name-only "$base_sha" "$head_sha" | sed 's/^/  /' || true
      fi
    fi
  fi

  local resolved
  resolved="$(timia_resolve_services "$selector" "${base_sha:-}" "$head_sha")"
  # shellcheck disable=SC2207
  SELECTED_SERVICES=($(echo "$resolved" | awk 'NF'))

  if [[ "${#SELECTED_SERVICES[@]}" -eq 0 ]]; then
    echo "Deploy checklist: (none) — no service image/config changes."
  else
    echo "Deploy checklist:"
    local svc
    for svc in "${SELECTED_SERVICES[@]}"; do
      if [[ "$svc" == nginx ]]; then
        echo "  - nginx (recreate only; no image pack)"
      else
        echo "  - $svc  →  $(timia_service_image "$svc")"
      fi
    done
  fi
}

timia_write_manifest() {
  local path
  path="$(timia_manifest_path)"
  mkdir -p "$OUT_DIR"
  {
    echo "HEAD=$(git rev-parse HEAD)"
    echo "SERVICES=${SELECTED_SERVICES[*]-}"
    echo "PACKED_AT=$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  } >"$path"
}

plan() {
  timia_require_pack_env
  export TIMIA_ENV_FILE="$(cd "$(dirname "$PACK_ENV")" && pwd)/$(basename "$PACK_ENV")"
  timia_select_services
}

timia_build_one() {
  local service="$1"
  local log="$OUT_DIR/build-${service}.log"
  local img revision
  img="$(timia_service_image "$service")"

  {
    case "$service" in
      core-service)
        revision="$(git rev-parse HEAD:codes/core-service 2>/dev/null || echo local)"
        export CORE_SERVICE_REVISION="$revision"
        timia_pull_image python:3.12-slim
        echo "Building core-service (revision=${revision}) ..."
        ;;
      file-service)
        revision="$(git rev-parse HEAD:codes/file-service 2>/dev/null || echo local)"
        export FILE_SERVICE_REVISION="$revision"
        timia_pull_image python:3.12-slim
        echo "Building file-service (revision=${revision}) ..."
        ;;
      web)
        revision="$(git rev-parse HEAD:codes/web 2>/dev/null || echo local)-api-${NEXT_PUBLIC_API_BASE_URL}"
        export WEB_REVISION="$revision"
        timia_pull_image node:22-alpine
        echo "Building web (revision=${revision}) ..."
        ;;
      mcp-server)
        revision="$(git rev-parse HEAD:codes/mcp-server 2>/dev/null || echo local)"
        export MCP_SERVER_REVISION="$revision"
        timia_pull_image python:3.12-slim
        echo "Building mcp-server (revision=${revision}) ..."
        ;;
    esac
    timia_compose_build "$service"
    if [[ "$service" == web ]]; then
      timia_verify_web_api_url "$NEXT_PUBLIC_API_BASE_URL" "$img"
    fi
    echo "BUILD_OK $service -> $img"
  } >"$log" 2>&1
}

timia_pack_one() {
  local service="$1"
  local img tar
  img="$(timia_service_image "$service")"
  tar="$(timia_service_tar "$service")"
  if ! docker image inspect "$img" >/dev/null 2>&1; then
    echo "Missing image $img for $service" >&2
    return 1
  fi
  echo "Saving $img -> $tar ..."
  docker save "$img" | gzip >"$tar"
  ls -lh "$tar"
}

pack() {
  timia_require_pack_env
  export TIMIA_ENV_FILE="$(cd "$(dirname "$PACK_ENV")" && pwd)/$(basename "$PACK_ENV")"
  mkdir -p "$OUT_DIR"
  echo "Pack env: NEXT_PUBLIC_API_BASE_URL=${NEXT_PUBLIC_API_BASE_URL}"

  timia_select_services

  local -a app_services=()
  local svc
  # shellcheck disable=SC2207
  app_services=($(timia_app_services_only "${SELECTED_SERVICES[@]-}"))

  if [[ "${#app_services[@]}" -eq 0 ]]; then
    echo "Nothing to pack (no app services selected)."
    timia_write_manifest
    return 0
  fi

  # Drop stale tarballs for services we are not shipping this round.
  for svc in "${TIMIA_APP_SERVICES[@]}"; do
    if ! timia_list_contains "$svc" "${app_services[@]}"; then
      rm -f "$(timia_service_tar "$svc")"
    fi
  done
  # Also drop legacy all-in-one bundle so upload won't accidentally use it.
  rm -f "${OUT_DIR}/timia-images.tar.gz"

  if [[ "${SKIP_BUILD:-0}" == "1" ]]; then
    echo "SKIP_BUILD=1 — packing existing local images only"
    for svc in "${app_services[@]}"; do
      docker image inspect "$(timia_service_image "$svc")" >/dev/null 2>&1 || {
        echo "SKIP_BUILD=1 but missing image: $(timia_service_image "$svc")" >&2
        exit 1
      }
    done
    if timia_list_contains web "${app_services[@]}"; then
      timia_verify_web_api_url "$NEXT_PUBLIC_API_BASE_URL"
    fi
  else
    echo "Building ${#app_services[@]} service(s) in parallel ..."
    local -a pids=()
    local -a failed=()
    for svc in "${app_services[@]}"; do
      timia_build_one "$svc" &
      pids+=("$!")
    done
    local i=0
    for svc in "${app_services[@]}"; do
      if ! wait "${pids[$i]}"; then
        failed+=("$svc")
        echo "FAIL build $svc — see $OUT_DIR/build-${svc}.log" >&2
        tail -n 40 "$OUT_DIR/build-${svc}.log" >&2 || true
      else
        echo "OK   build $svc"
        # Surface last lines for visibility
        grep -E '^(BUILD_OK|OK  |FAIL )' "$OUT_DIR/build-${svc}.log" || true
      fi
      i=$((i + 1))
    done
    if [[ "${#failed[@]}" -gt 0 ]]; then
      echo "Build failed for: ${failed[*]}" >&2
      exit 1
    fi
  fi

  echo "Packing ${#app_services[@]} image(s) ..."
  for svc in "${app_services[@]}"; do
    timia_pack_one "$svc"
  done

  timia_write_manifest
  echo "Pack done. Manifest: $(timia_manifest_path)"
  echo "Upload with: bash deploy/remote.sh upload"
}

timia_upload_one() {
  local service="$1"
  local tar remote_name log
  tar="$(timia_service_tar "$service")"
  remote_name="${REMOTE_TAR_PREFIX}-${service}.tar.gz"
  log="$OUT_DIR/upload-${service}.log"

  {
    echo "Uploading $tar -> ${SSH_USER}@${SSH_HOST}:~/${remote_name}"
    timia_ssh "rm -f ~/${remote_name} /tmp/${remote_name}"
    timia_scp "$tar" "${SSH_USER}@${SSH_HOST}:${remote_name}"
    timia_ssh "set -euo pipefail
      cd ${DEPLOY_PATH}
      gunzip -c ~/${remote_name} | docker load
      bash deploy/dc.sh up -d --no-build --force-recreate ${service}
      rm -f ~/${remote_name} /tmp/${remote_name}
      echo UPLOAD_OK ${service}
    "
  } >"$log" 2>&1
}

upload() {
  if [[ -z "$SSH_HOST" || -z "$SSH_USER" ]]; then
    echo "Set SSH_HOST and SSH_USER in $PACK_ENV or export them." >&2
    exit 1
  fi

  local -a services=()
  local manifest need_nginx=0
  manifest="$(timia_manifest_path)"

  if [[ -f "$manifest" ]]; then
    # shellcheck disable=SC1090
    # SERVICES=... line
    local line
    line="$(grep '^SERVICES=' "$manifest" || true)"
    # shellcheck disable=SC2206
    services=(${line#SERVICES=})
  elif [[ -n "${PACK_SERVICES:-}" && "${PACK_SERVICES}" != smart ]]; then
    # shellcheck disable=SC2207
    services=($(timia_resolve_services "$PACK_SERVICES"))
  else
    echo "Missing pack manifest ($manifest). Run: bash deploy/remote.sh pack" >&2
    exit 1
  fi

  if timia_list_contains nginx "${services[@]-}"; then
    need_nginx=1
  fi

  local -a app_services=()
  # shellcheck disable=SC2207
  app_services=($(timia_app_services_only "${services[@]-}"))

  # Recreate nginx after any app image swap so upstreams refresh.
  if [[ "${#app_services[@]}" -gt 0 ]]; then
    need_nginx=1
  fi

  if [[ "${#app_services[@]}" -eq 0 && "$need_nginx" -eq 0 ]]; then
    echo "Nothing to upload."
    return 0
  fi

  local svc tar
  for svc in "${app_services[@]}"; do
    tar="$(timia_service_tar "$svc")"
    if [[ ! -f "$tar" ]]; then
      echo "Missing packed image for $svc: $tar — run pack first" >&2
      exit 1
    fi
  done

  local git_ref="${GIT_REF:-$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo main)}"
  local skip_git_sync="${SKIP_GIT_SYNC:-0}"

  if [[ "$skip_git_sync" == "1" ]]; then
    echo "Installing on server (SKIP_GIT_SYNC=1, images only) ..."
  else
    echo "Syncing server git to ${git_ref} ..."
    timia_ssh "set -euo pipefail
      cd ${DEPLOY_PATH}
      git fetch origin ${git_ref}
      git checkout -fB ${git_ref} origin/${git_ref}
      test -f deploy/dc.sh
      echo SERVER_HEAD:\$(git rev-parse --short HEAD)
    "
  fi

  if [[ "${#app_services[@]}" -gt 0 ]]; then
    echo "Uploading ${#app_services[@]} service image(s) (parallel=${PARALLEL_UPLOAD}) ..."
    if [[ "$PARALLEL_UPLOAD" == "1" && "${#app_services[@]}" -gt 1 ]]; then
      local -a pids=()
      local -a failed=()
      local i=0
      for svc in "${app_services[@]}"; do
        timia_upload_one "$svc" &
        pids+=("$!")
      done
      i=0
      for svc in "${app_services[@]}"; do
        if ! wait "${pids[$i]}"; then
          failed+=("$svc")
          echo "FAIL upload $svc — see $OUT_DIR/upload-${svc}.log" >&2
          tail -n 40 "$OUT_DIR/upload-${svc}.log" >&2 || true
        else
          echo "OK   upload $svc"
          grep -E '^UPLOAD_OK' "$OUT_DIR/upload-${svc}.log" || true
        fi
        i=$((i + 1))
      done
      if [[ "${#failed[@]}" -gt 0 ]]; then
        echo "Upload failed for: ${failed[*]}" >&2
        exit 1
      fi
    else
      for svc in "${app_services[@]}"; do
        timia_upload_one "$svc"
        echo "OK   upload $svc"
        grep -E '^UPLOAD_OK' "$OUT_DIR/upload-${svc}.log" || true
      done
    fi
  fi

  if [[ "$need_nginx" -eq 1 ]]; then
    echo "Recreating nginx ..."
    timia_ssh "set -euo pipefail
      cd ${DEPLOY_PATH}
      bash deploy/dc.sh up -d --no-build --force-recreate nginx
      bash deploy/dc.sh up -d
    "
  else
    timia_ssh "cd ${DEPLOY_PATH} && bash deploy/dc.sh up -d"
  fi

  if timia_list_contains web "${app_services[@]-}"; then
    timia_ssh "if docker run --rm timia-web:prod sh -c \"grep -roh 'https://timia.online/api[^a-z-]' /app/.next 2>/dev/null | grep -q .\"; then
      echo 'ERROR: deployed web image still uses /api' >&2
      exit 1
    fi"
  fi

  echo "Done. Check: curl -fsS https://timia.online/core-service/health"
}

case "$CMD" in
  plan) plan ;;
  pack) pack ;;
  upload) upload ;;
  all)
    pack
    upload
    ;;
  -h|--help)
    sed -n '2,20p' "$0"
    ;;
  *)
    echo "Unknown command: $CMD (use plan|pack|upload|all)" >&2
    exit 2
    ;;
esac
