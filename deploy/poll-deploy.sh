#!/usr/bin/env bash
# Auto-deploy when origin/main advances (for cron — no inbound SSH from GitHub).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

GIT_REF="${GIT_REF:-main}"
LOCK_FILE="${LOCK_FILE:-/var/lock/timia-deploy.lock}"
LOG_FILE="${LOG_FILE:-/var/log/timia-deploy-poll.log}"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$LOG_FILE"
}

mkdir -p "$(dirname "$LOCK_FILE")" "$(dirname "$LOG_FILE")"
touch "$LOG_FILE"

exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  log "Skip: another deploy is running."
  exit 0
fi

if [[ ! -d .git ]]; then
  log "ERROR: not a git repo: $ROOT"
  exit 1
fi

export GIT_TERMINAL_PROMPT=0
export GIT_SSH_COMMAND="${GIT_SSH_COMMAND:-ssh -o BatchMode=yes -o ConnectTimeout=30}"

git fetch origin "$GIT_REF" >>"$LOG_FILE" 2>&1

LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse "origin/${GIT_REF}")"

if [[ "$LOCAL" == "$REMOTE" ]]; then
  exit 0
fi

log "New commit on origin/${GIT_REF}: ${LOCAL:0:7} -> ${REMOTE:0:7}, deploying ..."
DEPLOY_MODE="${DEPLOY_MODE:-smart}" bash deploy/deploy.sh >>"$LOG_FILE" 2>&1
log "Deploy finished."
