#!/usr/bin/env bash
# Run on the Lighthouse server: /opt/timia/deploy/deploy.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

# shellcheck source=env-path.sh
source "$(dirname "$0")/env-path.sh"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
GIT_REF="${GIT_REF:-main}"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

ENV_FILE="$(timia_resolve_env_file "$ROOT")"
export TIMIA_ENV_FILE="$ENV_FILE"
log "Using env file: $ENV_FILE"

if [[ "${SKIP_GIT_PULL:-0}" != "1" ]]; then
  if [[ ! -d .git ]]; then
    echo "No .git in $ROOT — clone the repository first (see docs/deploy/cloud.md)." >&2
    exit 1
  fi
  log "Step 1/4: git fetch & pull (origin/${GIT_REF}) ..."
  export GIT_TERMINAL_PROMPT=0
  export GIT_SSH_COMMAND="${GIT_SSH_COMMAND:-ssh -o BatchMode=yes -o ConnectTimeout=30}"
  git fetch origin "$GIT_REF"
  git checkout "$GIT_REF"
  git pull --ff-only origin "$GIT_REF"
  log "Git update done."
else
  log "Step 1/4: skip git pull (SKIP_GIT_PULL=1)."
fi

DC="./deploy/dc-prod.sh"
chmod +x "$DC"

export BUILDKIT_PROGRESS=plain
export COMPOSE_PROGRESS=plain

log "Step 2/4: docker build api (usually a few minutes) ..."
"$DC" build --progress=plain api

log "Step 3/4: docker build web — Next.js can take 15–40 min on 2GB RAM; output below is normal ..."
"$DC" build --progress=plain web

log "Step 4/4: docker compose up -d ..."
"$DC" up -d

log "Deploy finished. Service status:"
"$DC" ps
