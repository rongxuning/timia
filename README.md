## Timia

Daily management web app (MVP-1): login, workspaces, members (manual), projects, items, comments, activity log.

### Monorepo layout
- `codes/web`: Next.js web
- `codes/api`: FastAPI API (uv)
- `codes/app`: native client placeholder (iOS, future)

### Local dev

#### Quick start

```bash
make local          # Postgres in Docker
make api-install && make api   # terminal 1
make web-install && make web   # terminal 2
make verify         # smoke check API (+ Web if running)
make codegen        # export OpenAPI → src/types/api/generated.ts (after API changes)
```

#### 1) Start Postgres

```bash
make db
```

#### 2) Start API

```bash
make api-install
make api
```

If you renamed or moved this repo, delete the stale virtualenv and reinstall:

```bash
rm -rf codes/api/.venv && make api-install
```

If `uv sync` times out downloading packages (e.g. `cryptography`), use a PyPI mirror:

```bash
UV_INDEX_URL=https://pypi.tuna.tsinghua.edu.cn/simple make api-install
```

#### 3) Start Web

```bash
make web-install
make web
```

### Env
- Copy values from `.env.example` into:
  - `codes/api/.env`
  - `codes/web/.env.local`

### Production deploy (timia.online)

See [docs/deploy/cloud.md](docs/deploy/cloud.md) — Lighthouse deploy; fastest path: `deploy/pack-local.sh` + `deploy/upload-to-server.sh`.

