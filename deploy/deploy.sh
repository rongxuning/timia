#!/usr/bin/env bash
# Run on the Lighthouse server: /opt/timia/deploy/deploy.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

ENV_FILE="${ENV_FILE:-.env.prod}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
GIT_REF="${GIT_REF:-main}"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Missing $ENV_FILE — copy from .env.prod.example and fill secrets." >&2
  exit 1
fi

if [[ "${SKIP_GIT_PULL:-0}" != "1" ]]; then
  if [[ ! -d .git ]]; then
    echo "No .git in $ROOT — clone the repository first (see docs/deploy/cloud.md)." >&2
    exit 1
  fi
  echo "Updating code (origin/${GIT_REF}) ..."
  git fetch origin "$GIT_REF"
  git checkout "$GIT_REF"
  git pull --ff-only origin "$GIT_REF"
fi

DC="./deploy/dc-prod.sh"
chmod +x "$DC"

echo "Building images on server ..."
"$DC" build

echo "Starting stack ..."
"$DC" up -d

"$DC" ps
