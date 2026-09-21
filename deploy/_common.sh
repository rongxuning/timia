#!/usr/bin/env bash
# Shared helpers for deploy scripts.

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
  echo "No production env file. Run: bash deploy/local.sh bootstrap <repo-url>" >&2
  echo "  or: sudo cp .env.prod.example /etc/timia/.env.prod && nano /etc/timia/.env.prod" >&2
  return 1
}

timia_log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

# App services that have Docker images built by Timia.
TIMIA_APP_SERVICES=(core-service file-service web mcp-server)

timia_service_image() {
  case "$1" in
    core-service) echo timia-core-service:prod ;;
    file-service) echo timia-file-service:prod ;;
    web) echo timia-web:prod ;;
    mcp-server) echo timia-mcp-server:prod ;;
    *)
      echo "Unknown service: $1" >&2
      return 1
      ;;
  esac
}

timia_service_src_path() {
  case "$1" in
    core-service) echo codes/core-service ;;
    file-service) echo codes/file-service ;;
    web) echo codes/web ;;
    mcp-server) echo codes/mcp-server ;;
    *)
      echo "Unknown service: $1" >&2
      return 1
      ;;
  esac
}

# Map a git name-only diff to deploy targets.
# Prints unique tokens among: core-service file-service web mcp-server nginx
# Usage: timia_services_from_changed_files "$changed_file_list"
timia_services_from_changed_files() {
  local changed="$1"
  local -a out=()
  local all=0

  if echo "$changed" | grep -qE '^docker-compose\.prod\.yml$'; then
    all=1
  fi

  if [[ "$all" -eq 1 ]]; then
    out=(core-service file-service web mcp-server nginx)
  else
    echo "$changed" | grep -qE '^codes/core-service/' && out+=(core-service) || true
    echo "$changed" | grep -qE '^codes/file-service/' && out+=(file-service) || true
    echo "$changed" | grep -qE '^codes/web/' && out+=(web) || true
    echo "$changed" | grep -qE '^codes/mcp-server/' && out+=(mcp-server) || true
    echo "$changed" | grep -qE '^deploy/nginx\.conf$' && out+=(nginx) || true
  fi

  if [[ "${#out[@]}" -eq 0 ]]; then
    return 0
  fi
  printf '%s\n' "${out[@]}" | awk 'NF && !seen[$0]++'
}

# Resolve PACK_SERVICES / DEPLOY_MODE style selector into service tokens.
# Args: selector (smart|all|full|quick|comma-list|single), optional base_sha, optional head_sha
# Prints service tokens (may include nginx). Empty means nothing to deploy.
timia_resolve_services() {
  local selector="${1:-smart}"
  local base_sha="${2:-}"
  local head_sha="${3:-HEAD}"
  local changed

  case "$selector" in
    all|full)
      printf '%s\n' "${TIMIA_APP_SERVICES[@]}" nginx
      return 0
      ;;
    quick|none|"")
      return 0
      ;;
    smart)
      if [[ -z "$base_sha" ]]; then
        echo "smart deploy needs a base revision (server HEAD or DEPLOY_BASE)" >&2
        return 1
      fi
      if [[ "$base_sha" == "$(git rev-parse "$head_sha")" ]]; then
        return 0
      fi
      changed="$(git diff --name-only "$base_sha" "$head_sha")"
      timia_services_from_changed_files "$changed"
      return 0
      ;;
    core-service|file-service|web|mcp-server|nginx)
      echo "$selector"
      return 0
      ;;
    *)
      # comma/space separated list
      local token
      # shellcheck disable=SC2086
      for token in ${selector//,/ }; do
        case "$token" in
          core-service|file-service|web|mcp-server|nginx|all)
            if [[ "$token" == all ]]; then
              printf '%s\n' "${TIMIA_APP_SERVICES[@]}" nginx
              return 0
            fi
            echo "$token"
            ;;
          *)
            echo "Unknown service selector token: $token" >&2
            return 1
            ;;
        esac
      done
      return 0
      ;;
  esac
}

# Filter service list to app images only (drop nginx).
timia_app_services_only() {
  local svc
  for svc in "$@"; do
    case "$svc" in
      core-service|file-service|web|mcp-server) echo "$svc" ;;
    esac
  done
}

timia_list_contains() {
  local needle="$1"
  shift
  local item
  for item in "$@"; do
    [[ "$item" == "$needle" ]] && return 0
  done
  return 1
}
