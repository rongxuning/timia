#!/usr/bin/env bash
# Production docker compose wrapper — loads env from /etc/timia/.env.prod (outside git).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

timia_resolve_env_file() {
  local root="${1:-.}"
  if [[ -n "${ENV_FILE:-}" ]]; then
    [[ -f "$ENV_FILE" ]] && { echo "$ENV_FILE"; return 0; }
    echo "ENV_FILE is set but missing: $ENV_FILE" >&2
    return 1
  fi
  if [[ -f /etc/timia/.env.prod ]]; then
    echo /etc/timia/.env.prod
    return 0
  fi
  if [[ -f "$root/.env.prod" ]]; then
    echo "$root/.env.prod"
    return 0
  fi
  echo "No production env file. Run: bash deploy/deploy.sh bootstrap <repo-url>" >&2
  echo "  or: sudo cp .env.prod.example /etc/timia/.env.prod && nano /etc/timia/.env.prod" >&2
  return 1
}

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="$(timia_resolve_env_file "$ROOT")"
export TIMIA_ENV_FILE="$ENV_FILE"

exec docker compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" "$@"
