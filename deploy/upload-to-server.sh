#!/usr/bin/env bash
# From dev machine: upload image bundle and install on Lighthouse.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

BUNDLE="${BUNDLE:-deploy/dist/timia-images.tar.gz}"
SSH_HOST="${SSH_HOST:?set SSH_HOST}"
SSH_USER="${SSH_USER:?set SSH_USER}"
DEPLOY_PATH="${DEPLOY_PATH:-/opt/timia}"
REMOTE_TAR="/tmp/timia-images.tar.gz"

if [[ ! -f "$BUNDLE" ]]; then
  echo "Run deploy/pack-local.sh first. Missing: $BUNDLE" >&2
  exit 1
fi

echo "Uploading $BUNDLE -> ${SSH_USER}@${SSH_HOST}:${REMOTE_TAR}"
scp "$BUNDLE" "${SSH_USER}@${SSH_HOST}:${REMOTE_TAR}"

echo "Installing on server ..."
ssh "${SSH_USER}@${SSH_HOST}" "set -euo pipefail
  cd ${DEPLOY_PATH}
  git fetch origin main && git reset --hard origin/main || true
  bash deploy/install-images.sh ${REMOTE_TAR}
  rm -f ${REMOTE_TAR}
"

echo "Done. Check: curl -fsS https://timia.online/api/health"
