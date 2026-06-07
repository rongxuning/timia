#!/usr/bin/env bash
# Fast git sync: fetch + hard reset (faster than pull for deploy use).
# Prints previous HEAD to stdout; sets GIT_PREV_HEAD for callers.
set -euo pipefail

GIT_REF="${GIT_REF:-main}"

export GIT_TERMINAL_PROMPT=0
export GIT_SSH_COMMAND="${GIT_SSH_COMMAND:-ssh -o BatchMode=yes -o ConnectTimeout=30}"

PREV="$(git rev-parse HEAD)"
echo "$PREV"

git fetch origin "$GIT_REF"
git checkout "$GIT_REF"
git reset --hard "origin/${GIT_REF}"
