# Timia MCP Phase 1 (Remote HTTP) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Streamable HTTP transport for `codes/mcp-server` with per-request PAT auth, and deploy it behind `https://timia.online/mcp` so Cursor can connect remotely.

**Architecture:** Keep Phase 0 stdio path. Add `TIMIA_MCP_TRANSPORT=http` that serves an ASGI Streamable HTTP app (official MCP SDK) on `/mcp`. ASGI middleware binds `Authorization: Bearer tm_pat_…` into a per-request `TimiaHttpClient`. Production adds a `mcp-server` compose service and nginx location.

**Tech Stack:** Existing `mcp` SDK + httpx + pydantic-settings; add `uvicorn`; Docker/nginx/compose aligned with core-service.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-12-mcp-phase1-remote-design.md`
- Prerequisite: Phase 0 on `main` (`codes/mcp-server`, agent PATs)
- PAT prefix remains `tm_pat_`
- Tool names/contracts unchanged from Phase 0
- Logs to stderr only for stdio; HTTP mode may log access JSON to stderr (never log full PAT)
- Production public API base for PAT minting: `https://timia.online/core-service`
- In-compose MCP→core URL: `http://core-service:8000`
- Do not implement notes/plans tools, resources/prompts, or Web Token UI in this plan
- Tests: `cd codes/mcp-server && uv run pytest -q`
- Ruff line-length 100

---

## File map

| File | Role |
|------|------|
| `codes/mcp-server/src/timia_mcp/config.py` | transport/host/port/path; conditional PAT requirement |
| `codes/mcp-server/src/timia_mcp/request_context.py` | ContextVar for per-request client |
| `codes/mcp-server/src/timia_mcp/http_app.py` | ASGI app: auth middleware + MCP mount + `/health` |
| `codes/mcp-server/src/timia_mcp/server.py` | branch stdio vs http in `main()` |
| `codes/mcp-server/src/timia_mcp/http_client.py` | allow constructing client with explicit pat override |
| `codes/mcp-server/pyproject.toml` | add uvicorn dependency |
| `codes/mcp-server/Dockerfile` | production image |
| `codes/mcp-server/.env.example` | document new env vars |
| `codes/mcp-server/README.md` | remote Cursor config |
| `codes/mcp-server/tests/test_config_http.py` | transport validation |
| `codes/mcp-server/tests/test_http_app.py` | 401 / health / whoami via ASGI |
| `docker-compose.prod.yml` | `mcp-server` service |
| `deploy/nginx.conf` | `/mcp` proxy |
| `deploy/remote.sh` / `deploy/local.sh` | build/pack mcp-server when needed |
| `.env.prod.example` | MCP env comments |
| `docs/deploy/cloud.md` | MCP production section |
| `Makefile` | optional `mcp-server-http` local target |
| Optional: `codes/core-service/...` audit GET | Task 6 if time |

---

### Task 1: Config + ContextVar + client PAT override

**Files:**
- Modify: `codes/mcp-server/src/timia_mcp/config.py`
- Create: `codes/mcp-server/src/timia_mcp/request_context.py`
- Modify: `codes/mcp-server/src/timia_mcp/http_client.py`
- Test: `codes/mcp-server/tests/test_config_http.py`

**Interfaces:**
- Consumes: existing `Settings`
- Produces:
  - `Settings.transport: Literal["stdio","http"] = "stdio"`
  - `Settings.host: str = "127.0.0.1"`
  - `Settings.port: int = 8100`
  - `Settings.mcp_path: str = "/mcp"`
  - `pat: str | None = None` (optional in model; validated in `load_settings`)
  - `load_settings()` rules: stdio requires PAT; http does not
  - `request_client: ContextVar[TimiaHttpClient | None]`
  - `get_request_client() -> TimiaHttpClient` raises if missing
  - `TimiaHttpClient(settings, pat: str | None = None)` uses `pat or settings.pat`

- [ ] **Step 1: Write failing tests**

```python
# tests/test_config_http.py
import pytest
from timia_mcp.config import load_settings


def test_http_transport_allows_missing_pat(monkeypatch):
    monkeypatch.setenv("TIMIA_API_BASE", "http://core-service:8000")
    monkeypatch.delenv("TIMIA_PAT", raising=False)
    monkeypatch.setenv("TIMIA_MCP_TRANSPORT", "http")
    s = load_settings()
    assert s.transport == "http"
    assert s.pat is None


def test_stdio_still_requires_pat(monkeypatch):
    monkeypatch.setenv("TIMIA_API_BASE", "http://127.0.0.1:8000")
    monkeypatch.delenv("TIMIA_PAT", raising=False)
    monkeypatch.setenv("TIMIA_MCP_TRANSPORT", "stdio")
    with pytest.raises(ValueError, match="TIMIA_PAT"):
        load_settings()
```

- [ ] **Step 2: Run — expect FAIL**

`cd codes/mcp-server && uv run pytest tests/test_config_http.py -v`

- [ ] **Step 3: Implement config + context + client override**

Keep env names: `TIMIA_MCP_TRANSPORT`, `TIMIA_MCP_HOST`, `TIMIA_MCP_PORT`, `TIMIA_MCP_PATH` (pydantic aliases or Field(validation_alias=...)).

- [ ] **Step 4: Pass tests + commit**

```bash
cd codes/mcp-server && uv run pytest tests/test_config_http.py tests/test_config.py -q
git add codes/mcp-server
git commit -m "feat(mcp): config for http transport and request-scoped client"
```

---

### Task 2: HTTP ASGI app with Bearer PAT middleware

**Files:**
- Create: `codes/mcp-server/src/timia_mcp/http_app.py`
- Modify: `codes/mcp-server/src/timia_mcp/server.py`
- Modify: `codes/mcp-server/src/timia_mcp/tools/__init__.py` (resolve client via ContextVar when present)
- Modify: `codes/mcp-server/pyproject.toml` (add `uvicorn>=0.30`)
- Test: `codes/mcp-server/tests/test_http_app.py`

**Interfaces:**
- Produces:
  - `create_http_app(settings: Settings) -> ASGIApp`
  - `GET /health` → `{"ok": true, "transport": "http"}`
  - MCP Streamable HTTP mounted at `settings.mcp_path`
  - Middleware: require `Authorization: Bearer tm_pat_…`; set ContextVar client; close on response
  - `main()`: if http → `uvicorn.run(app, host=..., port=...)`; else existing stdio

**SDK note:** Inspect installed `mcp` package for Streamable HTTP entry (e.g. `mcp.server.fastmcp.FastMCP.streamable_http_app` or `mcp.server.streamable_http`). Prefer official helper. Document the chosen import in the commit message body.

Wire tools to use:

```python
client = get_request_client() if http else ctx.client
```

or always: `get_request_client()` if ContextVar set else `ctx.client`.

- [ ] **Step 1: Failing ASGI tests**

```python
# tests/test_http_app.py
import pytest
from httpx import ASGITransport, AsyncClient
from timia_mcp.config import Settings
from timia_mcp.http_app import create_http_app


@pytest.fixture
def app():
    settings = Settings(
        api_base="http://timia.test",
        pat=None,
        transport="http",
        host="0.0.0.0",
        port=8100,
        mcp_path="/mcp",
    )
    return create_http_app(settings)


@pytest.mark.asyncio
async def test_health(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        r = await ac.get("/health")
        assert r.status_code == 200
        assert r.json()["ok"] is True


@pytest.mark.asyncio
async def test_mcp_requires_auth(app):
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        r = await ac.post("/mcp", json={})
        assert r.status_code == 401
```

Add one respx-backed test that with `Authorization: Bearer tm_pat_test` a minimal MCP initialize or tool path reaches upstream (exact shape depends on SDK; if full MCP handshake is heavy, test a small internal hook that middleware + ContextVar works by exposing a debug route **only in tests**, or call `whoami` through the tool runner unit API). Prefer testing middleware in isolation:

```python
@pytest.mark.asyncio
async def test_middleware_sets_client(respx_mock, app):
    # If create_http_app exposes dependency, assert get_request_client during a protected route
    ...
```

- [ ] **Step 2: FAIL then implement**

- [ ] **Step 3: `uv sync` + full mcp pytest green**

- [ ] **Step 4: Commit**

```bash
git commit -am "feat(mcp): streamable HTTP transport with per-request PAT"
```

---

### Task 3: Dockerfile + compose + nginx

**Files:**
- Create: `codes/mcp-server/Dockerfile`
- Modify: `docker-compose.prod.yml`
- Modify: `deploy/nginx.conf`
- Modify: `.env.prod.example` (if present) or `docs/deploy` env notes
- Modify: `deploy/remote.sh` / `deploy/local.sh` as needed for build/pack
- Modify: `docs/deploy/cloud.md`

**Interfaces:**
- Image `timia-mcp-server:prod`
- Compose service env as in spec §2.2
- nginx `/mcp` with long timeouts, `proxy_buffering off`, forward `Authorization`

- [ ] **Step 1: Add Dockerfile** mirroring core-service uv pattern; `EXPOSE 8100`; CMD runs `timia-mcp`

- [ ] **Step 2: Wire compose + nginx**

- [ ] **Step 3: Update deploy scripts** so `PACK_SERVICES`/`DEPLOY_MODE` can include `mcp-server` without breaking existing web/core-only deploys

- [ ] **Step 4: Document in `docs/deploy/cloud.md`** — health curl, required env, rollback (scale to 0 / remove location)

- [ ] **Step 5: Commit**

```bash
git add codes/mcp-server/Dockerfile docker-compose.prod.yml deploy docs
git commit -m "feat(deploy): run mcp-server behind /mcp on production"
```

**Local verify (if Docker available):**

```bash
# build image
docker build -t timia-mcp-server:prod codes/mcp-server
# optional compose config check
TIMIA_ENV_FILE=.env.prod docker compose -f docker-compose.prod.yml config
```

---

### Task 4: README + Makefile local HTTP target + Cursor remote docs

**Files:**
- Modify: `codes/mcp-server/README.md`
- Modify: `codes/mcp-server/.env.example`
- Modify: `Makefile`
- Modify: root `README.md` (one line pointing to remote section)

**Content requirements for README:**

1. Mode A: stdio local API  
2. Mode B: stdio → production API (`TIMIA_API_BASE=https://timia.online/core-service`)  
3. Mode C: remote HTTP `url: https://timia.online/mcp` + `Authorization` header  
4. How to mint PAT on production  
5. Troubleshooting: 401, TLS, nginx 502, `proxy_buffering`

Makefile:

```makefile
mcp-server-http: mcp-server-install
	cd codes/mcp-server && \
	  TIMIA_MCP_TRANSPORT=http TIMIA_MCP_HOST=127.0.0.1 TIMIA_API_BASE=$${TIMIA_API_BASE:-http://127.0.0.1:8000} \
	  uv run timia-mcp
```

- [ ] **Step 1: Write docs + Makefile target**

- [ ] **Step 2: Commit**

```bash
git commit -am "docs(mcp): production remote HTTP Cursor setup"
```

---

### Task 5 (optional same PR): Audit list API

**Files:**
- Modify: `codes/core-service/app/routes/agent_tokens.py`
- Modify: `codes/core-service/app/schemas/agent_tokens.py`
- Modify: `codes/core-service/app/services/agent_tokens.py`
- Test: extend `tests/test_agent_tokens.py`
- Run codegen if OpenAPI changes

**Interface:**
- `GET /auth/agent-tokens/audit?limit=1..100` → list of `{id, tool_name, ok, error_detail, latency_ms, created_at}` for current user only

Skip this task if blocked; not required for remote MCP acceptance.

---

### Task 6: Integration smoke checklist (manual)

- [ ] Local: `TIMIA_MCP_TRANSPORT=http` + local core + PAT header via curl/httpx script against `/health` and MCP initialize  
- [ ] Staging/prod after deploy: `curl -fsS https://timia.online/health` is web; mcp health via path agreed in Task 3 (e.g. `https://timia.online/mcp/../` or expose `/mcp-health` — **prefer nginx also proxy `location = /mcp-health` → mcp `/health`** if `/health` conflicts). Decision: add nginx `location = /mcp-health { proxy_pass http://timia_mcp_server/health; }`  
- [ ] Cursor remote config with prod PAT → `whoami`  
- [ ] Revoke PAT → subsequent calls 401  

Record results in PR description.

---

## Phase 1 acceptance

- [ ] HTTP transport works with per-request PAT  
- [ ] stdio regression green  
- [ ] Production compose + nginx ship `/mcp`  
- [ ] README documents Cursor remote setup  
- [ ] No shared process PAT for multi-user HTTP  

## Out of this plan

Phase 1b: notes/plans tools, resources/prompts, Web Agent Tokens UI  
Phase 2: health tools, read-only PAT presets
