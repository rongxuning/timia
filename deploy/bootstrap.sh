#!/usr/bin/env bash
# First-time setup on Tencent Lighthouse (Docker CE).
# Clone repo, scaffold .env.prod, print next steps.
set -euo pipefail

DEPLOY_PATH="${DEPLOY_PATH:-/opt/timia}"
GIT_BRANCH="${GIT_BRANCH:-main}"
REPO_URL="${1:-}"

usage() {
  cat <<'EOF'
Usage:
  bootstrap.sh <git-repo-url> [deploy-path]

Arguments:
  git-repo-url   e.g. https://github.com/<user>/timia.git
                 or git@github.com:<user>/timia.git
  deploy-path    default: /opt/timia

Environment:
  DEPLOY_PATH    same as deploy-path (default /opt/timia)
  GIT_BRANCH     default main

Examples:
  ./bootstrap.sh https://github.com/you/timia.git
  ./bootstrap.sh git@github.com:you/timia.git /opt/timia

Before running (private repos):
  ssh-keygen -t ed25519 -C "timia-lighthouse" -f ~/.ssh/id_ed25519 -N ""
  cat ~/.ssh/id_ed25519.pub
  # Add the public key in GitHub → Repository → Settings → Deploy keys
EOF
}

if [[ "${1:-}" == "-h" || "${1:-}" == "--help" || -z "$REPO_URL" ]]; then
  usage
  [[ -z "$REPO_URL" ]] && exit 2
  exit 0
fi

if [[ -n "${2:-}" ]]; then
  DEPLOY_PATH="$2"
fi

if ! command -v git >/dev/null 2>&1; then
  echo "git is required. Install: apt-get install -y git" >&2
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "docker is required (use Lighthouse Docker CE image)." >&2
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "docker compose plugin is required." >&2
  exit 1
fi

sudo mkdir -p "$DEPLOY_PATH"
if [[ "$(id -u)" -ne 0 ]]; then
  sudo chown "$USER:$USER" "$DEPLOY_PATH"
fi

if [[ -d "$DEPLOY_PATH/.git" ]]; then
  echo "Repository already exists at $DEPLOY_PATH — fetching latest ..."
  cd "$DEPLOY_PATH"
  git fetch origin "$GIT_BRANCH"
  git checkout "$GIT_BRANCH"
  git pull --ff-only origin "$GIT_BRANCH"
else
  if [[ -n "$(ls -A "$DEPLOY_PATH" 2>/dev/null || true)" ]]; then
    echo "Directory is not empty and not a git repo: $DEPLOY_PATH" >&2
    exit 1
  fi
  echo "Cloning $REPO_URL (branch $GIT_BRANCH) into $DEPLOY_PATH ..."
  git clone --branch "$GIT_BRANCH" "$REPO_URL" "$DEPLOY_PATH"
  cd "$DEPLOY_PATH"
fi

chmod +x deploy/deploy.sh deploy/bootstrap.sh 2>/dev/null || true

if [[ ! -f .env.prod ]]; then
  cp .env.prod.example .env.prod
  echo "Created .env.prod from .env.prod.example"
else
  echo ".env.prod already exists — not overwritten"
fi

cat <<EOF

Bootstrap done: $DEPLOY_PATH

Next steps:
  1. Edit secrets:
       nano $DEPLOY_PATH/.env.prod
     Set POSTGRES_PASSWORD, JWT_SECRET, and matching DATABASE_URL.

  2. Issue HTTPS certificate (first time only):
       cd $DEPLOY_PATH
       docker compose -f docker-compose.prod.yml stop nginx 2>/dev/null || true
       apt-get update && apt-get install -y certbot
       certbot certonly --standalone -d timia.online

  3. First deploy (build on server):
       cd $DEPLOY_PATH
       export SKIP_GIT_PULL=1
       ./deploy/deploy.sh

  4. GitHub Actions: add Secrets SSH_HOST, SSH_USER, SSH_PRIVATE_KEY, DEPLOY_PATH=$DEPLOY_PATH

EOF
