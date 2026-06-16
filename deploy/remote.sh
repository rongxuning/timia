#!/usr/bin/env bash
# Remote deploy from dev machine: build images locally, upload to server.
# Usage:
#   bash deploy/remote.sh          # pack + upload
#   bash deploy/remote.sh pack     # build images → deploy/dist/timia-images.tar.gz
#   bash deploy/remote.sh upload   # scp bundle and install on server
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

CMD="${1:-all}"
PACK_ENV="${PACK_ENV:-.env.pack}"
OUT_DIR="${OUT_DIR:-deploy/dist}"
OUT_FILE="${OUT_FILE:-$OUT_DIR/timia-images.tar.gz}"
BUNDLE="${BUNDLE:-$OUT_FILE}"
SSH_HOST="${SSH_HOST:-}"
SSH_USER="${SSH_USER:-}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/timia}"
REMOTE_TAR="/tmp/timia-images.tar.gz"
export DOCKER_DEFAULT_PLATFORM="${DOCKER_DEFAULT_PLATFORM:-linux/amd64}"

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

  echo "Building timia-core-service:prod and timia-web:prod (platform=$DOCKER_DEFAULT_PLATFORM) ..."
  docker compose -f docker-compose.prod.yml --env-file "$PACK_ENV" build --progress=plain core-service web

  echo "Saving images to $OUT_FILE ..."
  docker save timia-core-service:prod timia-web:prod | gzip > "$OUT_FILE"
  ls -lh "$OUT_FILE"
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

  echo "Uploading $BUNDLE -> ${SSH_USER}@${SSH_HOST}:${REMOTE_TAR}"
  scp "$BUNDLE" "${SSH_USER}@${SSH_HOST}:${REMOTE_TAR}"

  echo "Installing on server ..."
  ssh "${SSH_USER}@${SSH_HOST}" "set -euo pipefail
    cd ${DEPLOY_PATH}
    git fetch origin main && git reset --hard origin/main || true
    gunzip -c ${REMOTE_TAR} | docker load
    bash deploy/dc.sh up -d --no-build core-service web
    bash deploy/dc.sh up -d
    rm -f ${REMOTE_TAR}
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
