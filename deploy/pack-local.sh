#!/usr/bin/env bash
# Build api+web images locally and save to deploy/dist/timia-images.tar.gz
# Upload with: bash deploy/upload-to-server.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

PACK_ENV="${PACK_ENV:-.env.pack}"
OUT_DIR="${OUT_DIR:-deploy/dist}"
OUT_FILE="${OUT_FILE:-$OUT_DIR/timia-images.tar.gz}"
# Lighthouse is usually amd64; set on Apple Silicon Mac.
export DOCKER_DEFAULT_PLATFORM="${DOCKER_DEFAULT_PLATFORM:-linux/amd64}"

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

echo "Building timia-api:prod and timia-web:prod (platform=$DOCKER_DEFAULT_PLATFORM) ..."
docker compose -f docker-compose.prod.yml --env-file "$PACK_ENV" build --progress=plain api web

echo "Saving images to $OUT_FILE ..."
docker save timia-api:prod timia-web:prod | gzip > "$OUT_FILE"
ls -lh "$OUT_FILE"
echo "Done. Upload: bash deploy/upload-to-server.sh"
