## Timia

Daily management web app (MVP-1): login, workspaces, members (manual), projects, items, comments, activity log.

### Monorepo layout
- `codes/web`: Next.js web
- `codes/core-service`: FastAPI core API (uv) — `make core-service`
- `codes/file-service`: FastAPI file API (uv, port 8003) — `make file-service`; bytes go to private MinIO
- `codes/app`: native client placeholder (iOS, future)
- Future backends (e.g. `notification-service`, `finance-service`): each under `codes/<name>/`, own Makefile target, Docker service, and nginx `/<name>/` route

### Local dev

#### All services in Docker

```bash
make docker-up       # build + start db/minio/core/file/web/mcp/nginx
make docker-verify   # http://localhost:8080
make docker-ps
make docker-down
```

Open **http://localhost:8080**. APIs: `/core-service/health`, `/file-service/health`, `/mcp-health`.

#### Quick start (apps on the host)

```bash
make local          # Postgres + MinIO in Docker
make core-service-install && make core-service   # terminal 1
make file-service-install && make file-service   # terminal 2
make web-install && make web   # terminal 3
make verify         # smoke check API (+ File API / Web if running)
make codegen        # export OpenAPI → web generated types (after API changes)
```

#### 1) Start Postgres

```bash
make db
```

#### 2) Start core-service

```bash
make core-service-install
make core-service
```

If you renamed or moved this repo, delete the stale virtualenv and reinstall:

```bash
rm -rf codes/core-service/.venv && make core-service-install
```

If `uv sync` times out downloading packages (e.g. `cryptography`), use a PyPI mirror:

```bash
UV_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple make core-service-install
```

#### 3) Start Web

```bash
make web-install
make web
```

### MCP (Agent)

Stdio (local) and remote Streamable HTTP (`https://timia.online/mcp`) for Cursor and other hosts. Cursor `mcpServers` key is **`timia-mcp`** (not `timia-prod`). See [codes/mcp-server/README.md](codes/mcp-server/README.md). Specs: [Phase 0](docs/superpowers/specs/2026-09-11-mcp-server-design.md) · [Phase 1 remote](docs/superpowers/specs/2026-09-12-mcp-phase1-remote-design.md).

```bash
make mcp-server-install
make mcp-server-test
make mcp-server-http   # local Streamable HTTP on :8100
```

### Env
- Copy values from `.env.example` into:
  - `codes/core-service/.env` (include `FILE_SERVICE_BASE` / `FILE_INTERNAL_TOKEN` so transfer/delete notify file-service)
  - `codes/file-service/.env` optional; `make file-service` also sources core-service `.env`
  - `codes/web/.env.local` (`NEXT_PUBLIC_API_BASE_URL`, `NEXT_PUBLIC_FILE_API_BASE_URL`)

### Production deploy (timia.online)

See [docs/deploy/cloud.md](docs/deploy/cloud.md).

| Command | Where | Purpose |
|---------|-------|---------|
| `bash deploy/local.sh` | production server | git sync → build → up |
| `bash deploy/remote.sh` | dev machine | smart: only changed services, parallel build/upload |
| `bash deploy/remote.sh plan` | dev machine | print which services need deploy |

