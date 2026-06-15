#!/usr/bin/env bash
# Backward-compatible compose wrapper — delegates to deploy/prod/dc.sh
set -euo pipefail
exec bash "$(dirname "$0")/prod/dc.sh" "$@"
