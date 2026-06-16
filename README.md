## Timia

Daily management web app (MVP-1): login, workspaces, members (manual), projects, items, comments, activity log.

### Monorepo layout
- `codes/web`: Next.js web
- `codes/core-service`: FastAPI core API (uv) — `make core-service`
- `codes/app`: native client placeholder (iOS, future)
- Future backends (e.g. `notification-service`, `finance-service`): each under `codes/<name>/`, own Makefile target, Docker service, and nginx `/<name>/` route

### Local dev

#### Quick start

```bash
make local          # Postgres in Docker
make core-service-install && make core-service   # terminal 1
make web-install && make web   # terminal 2
make verify         # smoke check API (+ Web if running)
make codegen        # export OpenAPI → src/types/api/generated.ts (after API changes)
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

### Env
- Copy values from `.env.example` into:
  - `codes/core-service/.env`
  - `codes/web/.env.local`

### Production deploy (timia.online)

See [docs/deploy/cloud.md](docs/deploy/cloud.md).

| Command | Where | Purpose |
|---------|-------|---------|
| `bash deploy/local.sh` | production server | git sync → build → up |
| `bash deploy/remote.sh` | dev machine | build images locally → upload to server |

