---
name: timia-deploy
description: Use when changing Timia production deploy, docker-compose.prod.yml, nginx, GitHub Actions deploy.yml, 轻量云, TCR, Let's Encrypt, /mcp proxy, or .env.prod.
---

# Timia Deploy

生产：**腾讯云轻量应用服务器 + 本机 Docker Compose 构建**。域名 `https://timia.online`。

**不要**引入 TCR/CCR、K8s、新的镜像仓库，或把构建改到 GitHub-hosted runner 作为主路径。

## 怎么发版

1. **轮询（主路径）**：服务器 cron 每 3 分钟 `git fetch`，`main` 有新提交则 `deploy/local.sh`
2. GitHub Actions SSH 只是辅助（国内轻量云常 `connection reset`）

细则：`docs/deploy/cloud.md`。编排：`docker-compose.prod.yml`。反代：`deploy/nginx.conf`。

## 易错

- 服务：`web`、`core-service`、`mcp-server`、`db`、`nginx`
- MCP：对外 `https://timia.online/mcp` + `/mcp-health`；`Authorization` 必须透传；`proxy_buffering off`
- 证书在宿主机 `/etc/letsencrypt`，compose 挂载进 nginx
- 环境变量：服务器 `.env.prod`（模板 `.env.prod.example`），不要把密钥提交进 git
- 只重发 MCP：`DEPLOY_MODE=mcp-server bash deploy/local.sh`
- Alembic 在 core 容器启动时 upgrade；双 head 会让服务起不来（先 merge migration）

改 nginx/compose 后以 `docs/deploy/cloud.md` 的 MCP/HTTPS 小节为准，不要另写一套路径。
