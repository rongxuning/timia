#!/usr/bin/env bash
# Production deploy — run via deploy/deploy.sh or deploy/prod/deploy.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

# shellcheck source=../env-path.sh
source "$(dirname "$0")/../env-path.sh"

COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
GIT_REF="${GIT_REF:-main}"
DEPLOY_MODE="${DEPLOY_MODE:-smart}"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

ENV_FILE="$(timia_resolve_env_file "$ROOT")"
export TIMIA_ENV_FILE="$ENV_FILE"
log "Using env file: $ENV_FILE"
log "Deploy mode: $DEPLOY_MODE"

PREV_HEAD=""
if [[ "${SKIP_GIT_PULL:-0}" != "1" ]]; then
  if [[ ! -d .git ]]; then
    echo "No .git in $ROOT — clone the repository first (see docs/deploy/cloud.md)." >&2
    exit 1
  fi
  log "Step 1: git fetch & sync (origin/${GIT_REF}) ..."
  PREV_HEAD="$(bash "$(dirname "$0")/../git-update.sh")"
  log "Git update done ($(echo "$PREV_HEAD" | cut -c1-7) -> $(git rev-parse --short HEAD))."
else
  log "Step 1: skip git (SKIP_GIT_PULL=1)."
  PREV_HEAD="$(git rev-parse HEAD)"
fi

DC="bash $(dirname "$0")/dc.sh"
export BUILDKIT_PROGRESS=plain
export COMPOSE_PROGRESS=plain

BUILD_CORE_SERVICE=0
BUILD_WEB=0

case "$DEPLOY_MODE" in
  full) BUILD_CORE_SERVICE=1; BUILD_WEB=1 ;;
  quick) BUILD_CORE_SERVICE=0; BUILD_WEB=0 ;;
  core-service) BUILD_CORE_SERVICE=1 ;;
  web) BUILD_WEB=1 ;;
  smart)
    CUR_HEAD="$(git rev-parse HEAD)"
    if [[ "$PREV_HEAD" == "$CUR_HEAD" ]]; then
      log "Already up to date — nothing to build."
      $DC up -d
      $DC ps
      exit 0
    fi
    CHANGED="$(git diff --name-only "$PREV_HEAD" "$CUR_HEAD")"
    echo "$CHANGED" | grep -qE '^codes/core-service/' && BUILD_CORE_SERVICE=1 || true
    echo "$CHANGED" | grep -qE '^codes/web/' && BUILD_WEB=1 || true
    if echo "$CHANGED" | grep -qE '^(docker-compose\.prod\.yml|deploy/prod/nginx\.conf)'; then
      BUILD_CORE_SERVICE=1
      BUILD_WEB=1
    fi
  ;;
  *)
    echo "Unknown DEPLOY_MODE=$DEPLOY_MODE (use smart|quick|full|core-service|web)" >&2
    exit 2
    ;;
esac

STEP=2
if [[ "$BUILD_CORE_SERVICE" -eq 1 ]]; then
  log "Step ${STEP}: docker build core-service ..."
  $DC build --progress=plain core-service
  STEP=$((STEP + 1))
fi
if [[ "$BUILD_WEB" -eq 1 ]]; then
  log "Step ${STEP}: docker build web ..."
  $DC build --progress=plain web
  STEP=$((STEP + 1))
fi

log "Step ${STEP}: docker compose up -d ..."
$DC up -d
log "Deploy finished. Service status:"
$DC ps
