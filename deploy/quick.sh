#!/usr/bin/env bash
# Quick deploy: update code + restart containers, no docker build.
set -euo pipefail
export DEPLOY_MODE=quick
exec bash "$(dirname "$0")/deploy.sh"
