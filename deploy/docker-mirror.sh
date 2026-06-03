#!/usr/bin/env bash
# One-time: configure Docker Hub mirrors on Tencent Lighthouse (China network).
# Run on the server: sudo ./deploy/docker-mirror.sh
set -euo pipefail

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo $0" >&2
  exit 1
fi

mkdir -p /etc/docker
if [[ -f /etc/docker/daemon.json ]]; then
  cp -a /etc/docker/daemon.json "/etc/docker/daemon.json.bak.$(date +%s)"
  echo "Backed up existing /etc/docker/daemon.json"
fi

cat > /etc/docker/daemon.json <<'EOF'
{
  "registry-mirrors": [
    "https://mirror.ccs.tencentyun.com",
    "https://docker.m.daocloud.io"
  ]
}
EOF

systemctl daemon-reload
systemctl restart docker

echo "Docker mirrors configured. Testing pull ..."
docker pull node:20-alpine
docker pull python:3.12-slim
echo "OK — retry: cd /opt/timia && ./deploy/deploy.sh"
