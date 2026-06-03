#!/usr/bin/env bash
# One-time: stop git from touching .env.prod inside the repo directory.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ ! -d .git ]]; then
  echo "Not a git repo: $ROOT" >&2
  exit 1
fi

if git ls-files --error-unmatch .env.prod >/dev/null 2>&1; then
  echo "Removing .env.prod from git index (file stays on disk until you move it) ..."
  git rm --cached -f .env.prod
fi

if ! grep -qxF '.env.prod' .git/info/exclude 2>/dev/null; then
  echo '.env.prod' >> .git/info/exclude
  echo "Added .env.prod to .git/info/exclude"
fi

if [[ -f .env.prod ]]; then
  echo ""
  echo "You still have $ROOT/.env.prod in the repo folder."
  echo "Move secrets to /etc/timia/.env.prod (recommended):"
  echo "  sudo mv .env.prod /etc/timia/.env.prod && sudo chmod 600 /etc/timia/.env.prod"
fi

echo "Done. git pull will not overwrite /etc/timia/.env.prod."
