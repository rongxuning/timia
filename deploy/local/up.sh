#!/usr/bin/env bash
# Local dev: Postgres in Docker; API + Web run on host via make.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

echo "Starting local Postgres..."
docker compose -f docker-compose.local.yml up -d db

echo ""
echo "Next (separate terminals):"
echo "  make api-install && make api"
echo "  make web-install && make web"
echo ""
echo "Verify: make verify"
