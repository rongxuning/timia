## Timia

Daily management web app (MVP-1): login, workspaces, members (manual), projects, items, comments, activity log.

### Monorepo layout
- `apps/web`: Next.js web
- `apps/api`: FastAPI API (uv)

### Local dev

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
rm -rf apps/api/.venv && make api-install
```

#### 3) Start Web

```bash
make web-install
make web
```

### Env
- Copy values from `.env.example` into:
  - `apps/api/.env`
  - `apps/web/.env.local`

