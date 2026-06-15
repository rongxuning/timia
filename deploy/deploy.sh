#!/usr/bin/env bash
# Backward-compatible entry — delegates to deploy/prod/deploy.sh
set -euo pipefail
exec bash "$(dirname "$0")/prod/deploy.sh" "$@"
