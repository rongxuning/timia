# shellcheck shell=bash
# Resolve production env file (outside git repo by default).
timia_resolve_env_file() {
  local root="${1:-.}"

  if [[ -n "${ENV_FILE:-}" ]]; then
    if [[ -f "$ENV_FILE" ]]; then
      echo "$ENV_FILE"
      return 0
    fi
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

  echo "No production env file. Run: sudo ./deploy/bootstrap.sh <repo-url>" >&2
  echo "  or: sudo cp .env.prod.example /etc/timia/.env.prod && nano /etc/timia/.env.prod" >&2
  return 1
}
