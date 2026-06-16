#!/usr/bin/env bash
# Server-side deploy (run on production host): git sync → smart build → up -d
#   bash deploy/local.sh                         # default deploy
#   bash deploy/local.sh bootstrap <repo-url>    # first-time setup
#   bash deploy/local.sh poll                    # cron: deploy if origin/main changed
#   sudo bash deploy/local.sh install-cron       # install poll cron (every 3 min)
#
# Env: DEPLOY_MODE=smart|quick|full|core-service|web  SKIP_GIT_PULL=1  GIT_REF=main
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
# shellcheck source=_common.sh
source "$SCRIPT_DIR/_common.sh"
cd "$ROOT"

git_sync() {
  local ref="${GIT_REF:-main}"
  export GIT_TERMINAL_PROMPT=0
  export GIT_SSH_COMMAND="${GIT_SSH_COMMAND:-ssh -o BatchMode=yes -o ConnectTimeout=30}"
  local prev
  prev="$(git rev-parse HEAD)"
  echo "$prev"
  git fetch origin "$ref"
  git checkout "$ref"
  git reset --hard "origin/${ref}"
}

cmd_deploy() {
  local git_ref="${GIT_REF:-main}"
  local deploy_mode="${DEPLOY_MODE:-smart}"
  local env_file prev_head dc

  env_file="$(timia_resolve_env_file "$ROOT")"
  export TIMIA_ENV_FILE="$env_file"
  timia_log "Using env file: $env_file"
  timia_log "Deploy mode: $deploy_mode"

  prev_head=""
  if [[ "${SKIP_GIT_PULL:-0}" != "1" ]]; then
    if [[ ! -d .git ]]; then
      echo "No .git in $ROOT — clone first: bash deploy/local.sh bootstrap <repo-url>" >&2
      exit 1
    fi
    timia_log "Step 1: git fetch & sync (origin/${git_ref}) ..."
    prev_head="$(git_sync)"
    timia_log "Git update done ($(echo "$prev_head" | cut -c1-7) -> $(git rev-parse --short HEAD))."
  else
    timia_log "Step 1: skip git (SKIP_GIT_PULL=1)."
    prev_head="$(git rev-parse HEAD)"
  fi

  dc="bash $SCRIPT_DIR/dc.sh"
  export BUILDKIT_PROGRESS=plain
  export COMPOSE_PROGRESS=plain

  local build_core=0 build_web=0 step=2 cur changed

  case "$deploy_mode" in
    full) build_core=1; build_web=1 ;;
    quick) build_core=0; build_web=0 ;;
    core-service) build_core=1 ;;
    web) build_web=1 ;;
    smart)
      cur="$(git rev-parse HEAD)"
      if [[ "$prev_head" == "$cur" ]]; then
        timia_log "Already up to date — nothing to build."
        $dc up -d
        $dc ps
        return 0
      fi
      changed="$(git diff --name-only "$prev_head" "$cur")"
      echo "$changed" | grep -qE '^codes/core-service/' && build_core=1 || true
      echo "$changed" | grep -qE '^codes/web/' && build_web=1 || true
      if echo "$changed" | grep -qE '^(docker-compose\.prod\.yml|deploy/nginx\.conf)'; then
        build_core=1
        build_web=1
      fi
      ;;
    *)
      echo "Unknown DEPLOY_MODE=$deploy_mode (use smart|quick|full|core-service|web)" >&2
      exit 2
      ;;
  esac

  if [[ "$build_core" -eq 1 ]]; then
    timia_log "Step ${step}: docker build core-service ..."
    $dc build --progress=plain core-service
    step=$((step + 1))
  fi
  if [[ "$build_web" -eq 1 ]]; then
    timia_log "Step ${step}: docker build web ..."
    $dc build --progress=plain web
    step=$((step + 1))
  fi

  timia_log "Step ${step}: docker compose up -d ..."
  $dc up -d
  timia_log "Deploy finished. Service status:"
  $dc ps
}

cmd_bootstrap() {
  local deploy_path="${DEPLOY_PATH:-/opt/timia}"
  local git_branch="${GIT_BRANCH:-main}"
  local repo_url="${1:-}"
  local prod_env="/etc/timia/.env.prod"

  if [[ -z "$repo_url" ]]; then
    cat <<'EOF' >&2
Usage: bash deploy/local.sh bootstrap <git-repo-url> [deploy-path]
  Production secrets: /etc/timia/.env.prod (outside git)
EOF
    exit 2
  fi

  [[ -n "${2:-}" ]] && deploy_path="$2"

  command -v git >/dev/null || { echo "git is required" >&2; exit 1; }
  command -v docker >/dev/null || { echo "docker is required" >&2; exit 1; }
  docker compose version >/dev/null || { echo "docker compose plugin is required" >&2; exit 1; }

  sudo mkdir -p "$deploy_path" /etc/timia
  [[ "$(id -u)" -ne 0 ]] && sudo chown "$USER:$USER" "$deploy_path"

  if [[ -d "$deploy_path/.git" ]]; then
    echo "Repository already exists at $deploy_path — fetching latest ..."
    cd "$deploy_path"
    git fetch origin "$git_branch"
    git checkout "$git_branch"
    git pull --ff-only origin "$git_branch"
  else
    [[ -n "$(ls -A "$deploy_path" 2>/dev/null || true)" ]] && {
      echo "Directory is not empty and not a git repo: $deploy_path" >&2
      exit 1
    }
    echo "Cloning $repo_url (branch $git_branch) into $deploy_path ..."
    git clone --branch "$git_branch" "$repo_url" "$deploy_path"
    cd "$deploy_path"
  fi

  chmod +x deploy/*.sh 2>/dev/null || true

  if [[ -f "$deploy_path/.env.prod" && ! -f "$prod_env" ]]; then
    echo "Moving $deploy_path/.env.prod -> $prod_env"
    sudo mv "$deploy_path/.env.prod" "$prod_env"
  fi
  if [[ ! -f "$prod_env" ]]; then
    sudo cp .env.prod.example "$prod_env"
    echo "Created $prod_env from .env.prod.example"
  else
    echo "$prod_env already exists — not overwritten"
  fi
  sudo chmod 600 "$prod_env"

  if git ls-files --error-unmatch .env.prod >/dev/null 2>&1; then
    git rm --cached -f .env.prod
  fi
  grep -qxF '.env.prod' .git/info/exclude 2>/dev/null || echo '.env.prod' >> .git/info/exclude

  cat <<EOF

Bootstrap done: $deploy_path

Next steps:
  1. sudo nano $prod_env
  2. cd $deploy_path && ./deploy/dc.sh stop nginx 2>/dev/null; certbot certonly --standalone -d timia.online
  3. cd $deploy_path && SKIP_GIT_PULL=1 ./deploy/local.sh
  4. sudo bash $deploy_path/deploy/local.sh install-cron

EOF
}

cmd_poll() {
  local git_ref="${GIT_REF:-main}"
  local lock_file="${LOCK_FILE:-/var/lock/timia-deploy.lock}"
  local log_file="${LOG_FILE:-/var/log/timia-deploy-poll.log}"

  poll_log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" | tee -a "$log_file"
  }

  mkdir -p "$(dirname "$lock_file")" "$(dirname "$log_file")"
  touch "$log_file"

  exec 9>"$lock_file"
  flock -n 9 || { poll_log "Skip: another deploy is running."; exit 0; }

  [[ -d .git ]] || { poll_log "ERROR: not a git repo: $ROOT"; exit 1; }

  export GIT_TERMINAL_PROMPT=0
  export GIT_SSH_COMMAND="${GIT_SSH_COMMAND:-ssh -o BatchMode=yes -o ConnectTimeout=30}"
  git fetch origin "$git_ref" >>"$log_file" 2>&1

  local local_head remote_head
  local_head="$(git rev-parse HEAD)"
  remote_head="$(git rev-parse "origin/${git_ref}")"

  [[ "$local_head" == "$remote_head" ]] && exit 0

  poll_log "New commit on origin/${git_ref}: ${local_head:0:7} -> ${remote_head:0:7}, deploying ..."
  DEPLOY_MODE="${DEPLOY_MODE:-smart}" bash "$SCRIPT_DIR/local.sh" >>"$log_file" 2>&1
  poll_log "Deploy finished."
}

cmd_install_cron() {
  local deploy_user="${DEPLOY_USER:-root}"
  local cron_file="/etc/cron.d/timia-deploy-poll"

  [[ "$(id -u)" -eq 0 ]] || { echo "Run as root: sudo $0 install-cron" >&2; exit 1; }

  chmod +x "$SCRIPT_DIR/local.sh"

  cat > "$cron_file" <<EOF
# Timia: auto-deploy when origin/main changes
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
*/3 * * * * ${deploy_user} cd ${ROOT} && bash deploy/local.sh poll
EOF

  chmod 644 "$cron_file"
  touch /var/log/timia-deploy-poll.log
  chmod 644 /var/log/timia-deploy-poll.log

  echo "Installed ${cron_file}"
  echo "Log: tail -f /var/log/timia-deploy-poll.log"
  echo "Test: cd ${ROOT} && bash deploy/local.sh poll"
}

case "${1:-deploy}" in
  deploy) cmd_deploy ;;
  bootstrap) shift; cmd_bootstrap "$@" ;;
  poll) cmd_poll ;;
  install-cron) cmd_install_cron ;;
  -h|--help)
    sed -n '2,8p' "$0"
    ;;
  *)
    echo "Unknown command: $1 (use deploy|bootstrap|poll|install-cron)" >&2
    exit 2
    ;;
esac
