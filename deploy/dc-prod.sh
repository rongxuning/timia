#!/usr/bin/env bash
# Production docker compose wrapper — always loads /opt/timia/.env.prod
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${ENV_FILE:-.env.prod}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ROOT/$ENV_FILE" >&2
  echo "Copy .env.prod.example and fill secrets (production does not use apps/api/.env)." >&2
  exit 1
fi

exec docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
