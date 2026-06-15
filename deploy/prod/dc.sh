#!/usr/bin/env bash
# Production docker compose wrapper — loads env from /etc/timia/.env.prod (outside git).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

# shellcheck source=../env-path.sh
source "$(dirname "$0")/../env-path.sh"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="$(timia_resolve_env_file "$ROOT")"
export TIMIA_ENV_FILE="$ENV_FILE"

exec docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
