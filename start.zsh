#!/usr/bin/env zsh
set -euo pipefail

# Timia local start guide (and optional helper).
#
# Quick start (recommended: run in separate terminals):
#
#   make db
#   make api-install
#   cd codes/api && PYTHONPATH=. uv run alembic upgrade head
#   make api
#
#   make web-install
#   make web
#
# Access:
# - Web: http://localhost:3000
# - API health: http://localhost:8000/health
# - API docs (Swagger): http://localhost:8000/docs
#
# Env:
# - Copy values from `.env.local` into:
#   - codes/api/.env
#   - codes/web/.env.local
#
# Notes:
# - If Alembic fails with "No module named 'app'", run it with `PYTHONPATH=.` as above.
# - API CORS allows http://localhost:3000 by default.

usage() {
  cat <<'EOF'
Usage:
  ./start.zsh help
  ./start.zsh print
  ./start.zsh db
  ./start.zsh migrate

This file is primarily a startup cheat-sheet. For long-running dev servers,
start them in separate terminals:

  make api
  make web
EOF
}

cmd="${1:-print}"
case "$cmd" in
  help|-h|--help)
    usage
    ;;
  print)
    usage
    echo
    echo "Access:"
    echo "  Web:       http://localhost:3000"
    echo "  API docs:  http://localhost:8000/docs"
    echo "  API health http://localhost:8000/health"
    ;;
  db)
    make db
    ;;
  migrate)
    (cd codes/api && PYTHONPATH=. uv run alembic upgrade head)
    ;;
  *)
    echo "Unknown command: $cmd" >&2
    echo >&2
    usage >&2
    exit 2
    ;;
esac

