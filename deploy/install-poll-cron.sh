#!/usr/bin/env bash
# Install cron: check GitHub every 3 minutes and deploy if main changed.
# Run on Lighthouse: sudo bash deploy/install-poll-cron.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEPLOY_USER="${DEPLOY_USER:-root}"
CRON_FILE="/etc/cron.d/timia-deploy-poll"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo $0" >&2
  exit 1
fi

chmod +x "$ROOT/deploy/poll-deploy.sh" "$ROOT/deploy/deploy.sh"

cat > "$CRON_FILE" <<EOF
# Timia: auto-deploy when origin/main changes (no GitHub Actions SSH required)
SHELL=/bin/bash
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
*/3 * * * * ${DEPLOY_USER} cd ${ROOT} && bash deploy/poll-deploy.sh
EOF

chmod 644 "$CRON_FILE"
touch /var/log/timia-deploy-poll.log
chmod 644 /var/log/timia-deploy-poll.log

echo "Installed ${CRON_FILE}"
echo "Log: tail -f /var/log/timia-deploy-poll.log"
echo "Test now: cd ${ROOT} && bash deploy/poll-deploy.sh"
