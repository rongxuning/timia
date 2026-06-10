#!/usr/bin/env bash
# On Lighthouse: load packed images and restart api/web without building.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

TAR="${1:-deploy/dist/timia-images.tar.gz}"

if [[ ! -f "$TAR" ]]; then
  echo "Missing image bundle: $TAR" >&2
  exit 1
fi

echo "Loading images from $TAR ..."
gunzip -c "$TAR" | docker load

DC="bash $(dirname "$0")/dc-prod.sh"
echo "Restarting api + web (no build) ..."
$DC up -d --no-build api web
$DC up -d

echo "Status:"
$DC ps
