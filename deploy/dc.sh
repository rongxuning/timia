#!/usr/bin/env bash
# Production docker compose wrapper — loads env from /etc/timia/.env.prod (outside git).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=_common.sh
source "$SCRIPT_DIR/_common.sh"
cd "$ROOT"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="$(timia_resolve_env_file "$ROOT")"
export TIMIA_ENV_FILE="$ENV_FILE"

exec docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
