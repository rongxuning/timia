## Timia

Daily management web app (MVP-1): login, workspaces, members (manual), projects, items, comments, activity log.

### 从旧名 Nomia 迁移本地数据库

若你本地曾用 `docker-compose` 的 `nomia` 用户与 `nomia_pgdata` 卷，更新后默认改为 `timia` / `timia_pgdata`。可选做法：

- **全新库**：`docker compose down` 后删除旧卷再 `make db`（会清空数据），并把 `apps/api/.env` 中的 `DATABASE_URL` 与 `.env.example` 对齐。
- **保留旧库**：在 `apps/api/.env` 中继续使用 `postgresql+psycopg://nomia:nomia@localhost:5432/nomia`（需自行启动对应 Postgres 或保留旧 compose 配置）。

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

#### 3) Start Web

```bash
make web-install
make web
```

### Env
- Copy values from `.env.example` into:
  - `apps/api/.env`
  - `apps/web/.env.local`

