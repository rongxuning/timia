#!/usr/bin/env bash
# Smoke-check local Timia stack (API + optional Web).
set -euo pipefail

API_URL="${API_URL:-http://127.0.0.1:8000}"
WEB_URL="${WEB_URL:-http://127.0.0.1:3000}"

fail=0

if curl -sf "${API_URL}/health" | grep -q '"ok"'; then
  echo "OK  API health ${API_URL}/health"
else
  echo "FAIL API health ${API_URL}/health"
  fail=1
fi

if curl -sf -o /dev/null -w "%{http_code}" "${WEB_URL}" | grep -qE '^(200|307|308)$'; then
  echo "OK  Web ${WEB_URL}"
else
  echo "WARN Web not reachable at ${WEB_URL} (start with: make web)"
fi

if [[ "$fail" -ne 0 ]]; then
  exit 1
fi

echo "Verify passed."
