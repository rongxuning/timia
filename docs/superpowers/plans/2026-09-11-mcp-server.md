# Timia MCP Server (Phase 0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a local stdio MCP server (`codes/mcp-server`) plus core-service Personal Access Tokens so agents can call P0 Timia tools (schedule/items/workspaces) as the owning user.

**Architecture:** `timia-mcp` is a thin MCP adapter: validate tool args → `Authorization: Bearer tm_pat_…` → existing core-service REST → trim JSON for the host. core-service gains `agent_tokens` / `agent_tool_calls`, PAT verification inside `get_current_user`, and a PAT-only path→scope allowlist. No MCP process talks to Postgres.

**Tech Stack:** Python ≥3.11, uv, FastAPI/SQLAlchemy/Alembic (core), official `mcp` SDK + httpx + Pydantic v2 (mcp-server), pytest, Ruff line-length 100.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-09-11-mcp-server-design.md` (Phase 0 only; P1/P2 out of this plan)
- Package path: `codes/mcp-server` (import package `timia_mcp`, console script `timia-mcp`)
- PAT prefix: `tm_pat_`; body = 32 url-safe random bytes; hash = `sha256(f"{jwt_secret}:{token}").hexdigest()`
- Default create scopes: `profile:read`, `schedule:read`, `schedule:write`, `workspace:read`, `workspace:write`, `admin:tokens`
- MCP logs → **stderr only** (stdout is the stdio transport)
- Tool descriptions / prompt strings in **English**; error codes snake_case
- Reuse existing permissions via HTTP; do not reimplement RBAC in mcp-server
- After core OpenAPI changes: `make codegen` from repo root
- Core tests: `cd codes/core-service && uv run pytest -q`
- MCP tests: `cd codes/mcp-server && uv run pytest -q`
- Ruff: `uv run ruff check .` in each package
- Do not register delete-workspace / delete-project / health-sync tools
- Auth dependency name in this repo is `get_current_user` (`app/api/deps.py`)
- Mixins: `UUIDPrimaryKeyMixin`, `TimestampMixin`, `utcnow` in `app/models/_mixins.py`
- Next Alembic revision: `0033_agent_tokens` revising `0032_health_partial_indexes`

---

## File map

| File | Role |
|------|------|
| `codes/core-service/app/models/agent_token.py` | `AgentToken`, `AgentToolCall` ORM |
| `codes/core-service/app/models/__init__.py` | Export new models |
| `codes/core-service/app/migrations/versions/0033_agent_tokens.py` | Tables |
| `codes/core-service/app/services/agent_tokens.py` | Hash, create, verify, revoke, audit write, path scope map |
| `codes/core-service/app/schemas/agent_tokens.py` | Create/Out/Audit DTOs |
| `codes/core-service/app/routes/agent_tokens.py` | `/auth/agent-tokens` |
| `codes/core-service/app/api/deps.py` | PAT branch in `get_current_user` + scope check |
| `codes/core-service/app/main.py` | Include agent_tokens router |
| `codes/core-service/app/schemas/workspace.py` | Add optional `role` on `WorkspaceOut` |
| `codes/core-service/app/routes/workspaces.py` | Populate `role` on list |
| `codes/core-service/tests/test_agent_tokens.py` | PAT + scope tests |
| `codes/mcp-server/pyproject.toml` | Package metadata |
| `codes/mcp-server/.env.example` | Env template |
| `codes/mcp-server/README.md` | Install + Cursor config |
| `codes/mcp-server/src/timia_mcp/**` | MCP server implementation |
| `codes/mcp-server/tests/**` | httpx/respx unit tests |
| `Makefile` | `mcp-server-install` / `mcp-server-test` |
| `README.md` | Link MCP section |

---

### Task 1: PAT crypto helpers + models + migration

**Files:**
- Create: `codes/core-service/app/services/agent_tokens.py`
- Create: `codes/core-service/app/models/agent_token.py`
- Create: `codes/core-service/app/migrations/versions/0033_agent_tokens.py`
- Modify: `codes/core-service/app/models/__init__.py`
- Test: `codes/core-service/tests/test_agent_token_crypto.py`

**Interfaces:**
- Consumes: `settings.jwt_secret`, `UUIDPrimaryKeyMixin`, `TimestampMixin`, `utcnow`
- Produces:
  - `PAT_PREFIX = "tm_pat_"`
  - `DEFAULT_SCOPES: list[str]`
  - `ALL_SCOPES: frozenset[str]`
  - `hash_pat(token: str) -> str`
  - `generate_pat() -> tuple[str, str, str]` → `(full_token, token_prefix, token_hash)`
  - `class AgentToken`
  - `class AgentToolCall`

- [ ] **Step 1: Write failing crypto tests**

```python
# codes/core-service/tests/test_agent_token_crypto.py
from app.core.config import settings
from app.services.agent_tokens import PAT_PREFIX, generate_pat, hash_pat


def test_generate_pat_prefix_and_hash_roundtrip():
    full, prefix, hashed = generate_pat()
    assert full.startswith(PAT_PREFIX)
    assert prefix == full[:12]
    assert hashed == hash_pat(full)
    assert hash_pat(full) != hash_pat(full + "x")
    assert hashed == __import__("hashlib").sha256(
        f"{settings.jwt_secret}:{full}".encode()
    ).hexdigest()
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd codes/core-service && uv run pytest tests/test_agent_token_crypto.py -v`  
Expected: FAIL import error `agent_tokens`

- [ ] **Step 3: Implement helpers + models + migration**

```python
# codes/core-service/app/services/agent_tokens.py
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.agent_token import AgentToken, AgentToolCall
from app.models._mixins import utcnow
from app.models.user import User

PAT_PREFIX = "tm_pat_"
DEFAULT_SCOPES: list[str] = [
    "profile:read",
    "schedule:read",
    "schedule:write",
    "workspace:read",
    "workspace:write",
    "admin:tokens",
]
ALL_SCOPES = frozenset(
    {
        *DEFAULT_SCOPES,
        "notes:read",
        "notes:write",
        "plans:read",
        "plans:write",
        "health:read",
    }
)


def hash_pat(token: str) -> str:
    return hashlib.sha256(f"{settings.jwt_secret}:{token}".encode()).hexdigest()


def generate_pat() -> tuple[str, str, str]:
    body = secrets.token_urlsafe(32)
    full = f"{PAT_PREFIX}{body}"
    prefix = full[:12]
    return full, prefix, hash_pat(full)
```

```python
# codes/core-service/app/models/agent_token.py
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models._mixins import TimestampMixin, UUIDPrimaryKeyMixin, utcnow


class AgentToken(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "agent_tokens"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    token_prefix: Mapped[str] = mapped_column(String(16), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False, index=True)
    scopes: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class AgentToolCall(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "agent_tool_calls"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    token_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("agent_tokens.id", ondelete="CASCADE"), index=True, nullable=False
    )
    tool_name: Mapped[str] = mapped_column(String(80), nullable=False)
    ok: Mapped[bool] = mapped_column(Boolean, nullable=False)
    error_detail: Mapped[str | None] = mapped_column(String(120), nullable=True)
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    request_meta: Mapped[dict] = mapped_column(JSONB, nullable=False, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, default=utcnow)
```

Migration `0033_agent_tokens.py`: `revision = "0033_agent_tokens"`, `down_revision = "0032_health_partial_indexes"`; create both tables with indexes matching the model (unique on `token_hash`).

Export both models from `app/models/__init__.py` `__all__`.

- [ ] **Step 4: Run crypto tests**

Run: `cd codes/core-service && uv run pytest tests/test_agent_token_crypto.py -v`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add codes/core-service/app/services/agent_tokens.py \
  codes/core-service/app/models/agent_token.py \
  codes/core-service/app/models/__init__.py \
  codes/core-service/app/migrations/versions/0033_agent_tokens.py \
  codes/core-service/tests/test_agent_token_crypto.py
git commit -m "feat(core): add agent PAT models and hash helpers"
```

---

### Task 2: Verify PAT + path scope allowlist in auth deps

**Files:**
- Modify: `codes/core-service/app/services/agent_tokens.py` (add verify + scope resolve)
- Modify: `codes/core-service/app/api/deps.py`
- Test: `codes/core-service/tests/test_agent_token_scopes.py`

**Interfaces:**
- Consumes: `AgentToken`, `hash_pat`, `PAT_PREFIX`
- Produces:
  - `verify_pat(db, token: str) -> tuple[User, AgentToken]`
  - `required_scope_for_request(method: str, path: str) -> str | None`
    - `None` means “any valid PAT” (audit POST only)
    - raises conceptually via deps with `pat_path_not_allowed` when no rule matches
  - `get_current_user` sets `request.state.agent_token` when PAT auth succeeds

- [ ] **Step 1: Write failing scope-map unit tests**

```python
# codes/core-service/tests/test_agent_token_scopes.py
import pytest

from app.services.agent_tokens import required_scope_for_request


@pytest.mark.parametrize(
    ("method", "path", "expected"),
    [
        ("GET", "/auth/me", "profile:read"),
        ("GET", "/auth/agent-tokens", "admin:tokens"),
        ("POST", "/auth/agent-tokens", "admin:tokens"),
        ("DELETE", "/auth/agent-tokens/abc", "admin:tokens"),
        ("POST", "/auth/agent-tokens/audit", None),
        ("GET", "/workspaces", "workspace:read"),
        ("GET", "/views/workspace/x/activity", "workspace:read"),
        ("POST", "/workspaces/w/projects/p/items/i/comments", "workspace:write"),
        ("GET", "/views/schedule/calendar", "schedule:read"),
        ("GET", "/workspaces/w/projects/p/items", "schedule:read"),
        ("POST", "/workspaces/w/projects/p/items", "schedule:write"),
        ("PATCH", "/workspaces/w/projects/p/items/i", "schedule:write"),
        ("POST", "/views/schedule/natural-language/parse", "schedule:write"),
    ],
)
def test_required_scope_for_request(method, path, expected):
    assert required_scope_for_request(method, path) == expected


def test_unknown_path_returns_sentinel():
    assert required_scope_for_request("GET", "/health/sync/samples") == "__deny__"
```

- [ ] **Step 2: Run to verify fail**

Run: `cd codes/core-service && uv run pytest tests/test_agent_token_scopes.py -v`  
Expected: FAIL (`required_scope_for_request` missing)

- [ ] **Step 3: Implement scope map + verify + deps PAT branch**

Append to `agent_tokens.py`:

```python
def required_scope_for_request(method: str, path: str) -> str | None:
    """Return required scope, None for audit-only, or '__deny__' if PAT cannot call path."""
    m = method.upper()
    p = path.rstrip("/") or "/"

    if m == "POST" and p == "/auth/agent-tokens/audit":
        return None
    if p == "/auth/me" and m == "GET":
        return "profile:read"
    if p.startswith("/auth/agent-tokens") and m in {"GET", "POST", "DELETE"}:
        return "admin:tokens"
    if m == "GET" and (
        p.startswith("/workspaces")
        or p.startswith("/views/workspace")
        or p.startswith("/users")
        or p.startswith("/views/users")
    ):
        # item GET under /workspaces/.../items is schedule:read — check before generic workspace
        if "/items" in p:
            return "schedule:read"
        return "workspace:read"
    if m in {"POST", "PATCH"} and "/comments" in p:
        return "workspace:write"
    if m == "GET" and (p.startswith("/views/schedule") or "/items" in p):
        return "schedule:read"
    if m in {"POST", "PATCH"} and (
        "/items" in p or p == "/views/schedule/natural-language/parse"
    ):
        return "schedule:write"
    return "__deny__"


def verify_pat(db: Session, token: str) -> tuple[User, AgentToken]:
    if not token.startswith(PAT_PREFIX):
        raise ValueError("invalid_token")
    row = db.scalar(select(AgentToken).where(AgentToken.token_hash == hash_pat(token)))
    now = utcnow()
    if (
        row is None
        or row.revoked_at is not None
        or (row.expires_at is not None and row.expires_at <= now)
    ):
        raise ValueError("invalid_token")
    user = db.get(User, row.user_id)
    if not user or user.status != "active":
        raise ValueError("user_disabled")
    row.last_used_at = now
    db.add(row)
    db.commit()
    db.refresh(row)
    return user, row
```

Update `get_current_user` in `app/api/deps.py` to accept `Request`, and **before** JWT decode:

```python
from fastapi import Request

def get_current_user(
    request: Request,
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing_token")
    token = authorization.split(" ", 1)[1].strip()

    if token.startswith("tm_pat_"):
        from app.services.agent_tokens import required_scope_for_request, verify_pat

        try:
            user, agent_token = verify_pat(db, token)
        except ValueError as e:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e)
            ) from e
        needed = required_scope_for_request(request.method, request.url.path)
        if needed == "__deny__":
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="pat_path_not_allowed")
        if needed is not None and needed not in (agent_token.scopes or []):
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="insufficient_scope")
        request.state.agent_token_id = str(agent_token.id)
        request.state.agent_scopes = list(agent_token.scopes or [])
        return user

    # existing JWT path unchanged...
```

- [ ] **Step 4: Run scope unit tests**

Run: `cd codes/core-service && uv run pytest tests/test_agent_token_scopes.py -v`  
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add codes/core-service/app/services/agent_tokens.py \
  codes/core-service/app/api/deps.py \
  codes/core-service/tests/test_agent_token_scopes.py
git commit -m "feat(core): authenticate agent PATs with path scopes"
```

---

### Task 3: Agent token HTTP API + audit endpoint

**Files:**
- Create: `codes/core-service/app/schemas/agent_tokens.py`
- Create: `codes/core-service/app/routes/agent_tokens.py`
- Modify: `codes/core-service/app/services/agent_tokens.py` (CRUD helpers)
- Modify: `codes/core-service/app/main.py`
- Modify: `codes/core-service/app/schemas/workspace.py` (`role: str | None = None` on `WorkspaceOut`)
- Modify: `codes/core-service/app/routes/workspaces.py` (select `WorkspaceMember.role`, pass into `WorkspaceOut`)
- Test: `codes/core-service/tests/test_agent_tokens.py`

**Interfaces:**
- Produces routes:
  - `GET /auth/agent-tokens` → `list[AgentTokenOut]`
  - `POST /auth/agent-tokens` → `AgentTokenCreatedOut` (includes `token` once)
  - `DELETE /auth/agent-tokens/{token_id}` → 204
  - `POST /auth/agent-tokens/audit` → 204
- Schemas: `AgentTokenCreate`, `AgentTokenOut`, `AgentTokenCreatedOut`, `AgentToolCallAuditIn`

- [ ] **Step 1: Write API tests (auth required + create/list/revoke + PAT me + scope deny)**

Use the same real-DB pattern as `tests/test_web_auth.py`: create user, obtain a normal web/JWT access token via existing login helpers if available; otherwise insert user and `create_access_token(subject=str(user.id), audience=settings.jwt_audience)`.

```python
# codes/core-service/tests/test_agent_tokens.py (essential cases)
def test_create_list_revoke_agent_token(client_and_user_headers):
    client, headers = client_and_user_headers
    created = client.post(
        "/auth/agent-tokens",
        headers=headers,
        json={"name": "cursor"},
    )
    assert created.status_code == 201
    body = created.json()
    assert body["token"].startswith("tm_pat_")
    token_id = body["id"]
    listed = client.get("/auth/agent-tokens", headers=headers)
    assert listed.status_code == 200
    assert all("token" not in row for row in listed.json())
    me = client.get("/auth/me", headers={"Authorization": f"Bearer {body['token']}"})
    assert me.status_code == 200
    denied = client.get(
        "/health/sync-status",
        headers={"Authorization": f"Bearer {body['token']}"},
    )
    assert denied.status_code == 403
    assert denied.json()["detail"] in {"pat_path_not_allowed", "insufficient_scope"}
    revoked = client.delete(f"/auth/agent-tokens/{token_id}", headers=headers)
    assert revoked.status_code == 204
    me2 = client.get("/auth/me", headers={"Authorization": f"Bearer {body['token']}"})
    assert me2.status_code == 401


def test_pat_without_schedule_write_cannot_create_item(client_and_user_headers, workspace_project_ids):
    client, headers = client_and_user_headers
    ws, pj = workspace_project_ids
    created = client.post(
        "/auth/agent-tokens",
        headers=headers,
        json={
            "name": "ro",
            "scopes": ["profile:read", "schedule:read", "workspace:read", "admin:tokens"],
        },
    )
    pat = created.json()["token"]
    resp = client.post(
        f"/workspaces/{ws}/projects/{pj}/items",
        headers={"Authorization": f"Bearer {pat}"},
        json={"title": "x"},
    )
    assert resp.status_code == 403
    assert resp.json()["detail"] == "insufficient_scope"
```

Implement fixtures in the same file (or extend conftest) mirroring `test_web_auth` user setup. If creating a full workspace/project fixture is heavy, reuse patterns from `test_workspace.py` / `test_item_schedule.py`.

- [ ] **Step 2: Run tests — expect FAIL (route missing)**

Run: `cd codes/core-service && uv run pytest tests/test_agent_tokens.py -v`  
Expected: FAIL 404 / import

- [ ] **Step 3: Implement schemas, service CRUD, routes, workspace role field**

```python
# schemas/agent_tokens.py
class AgentTokenCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    scopes: list[str] | None = None
    expires_at: datetime | None = None

class AgentTokenOut(BaseModel):
    id: str
    name: str
    token_prefix: str
    scopes: list[str]
    expires_at: datetime | None
    revoked_at: datetime | None
    last_used_at: datetime | None
    created_at: datetime

class AgentTokenCreatedOut(AgentTokenOut):
    token: str

class AgentToolCallAuditIn(BaseModel):
    tool_name: str = Field(min_length=1, max_length=80)
    ok: bool
    error_detail: str | None = Field(default=None, max_length=120)
    latency_ms: int = Field(default=0, ge=0)
    request_meta: dict = Field(default_factory=dict)
```

Routes under `APIRouter(prefix="/auth/agent-tokens", tags=["agent-tokens"])`:

- Create: validate scopes ⊆ `ALL_SCOPES`; default `DEFAULT_SCOPES`; store hash; return created out with plaintext once.
- List: only `user_id == current user`, never hash/plaintext.
- Delete: soft-revoke (`revoked_at=utcnow()`); 404 if other user’s id.
- Audit: requires PAT (`request.state.agent_token_id`); insert `AgentToolCall`; truncate string values in `request_meta` to 200 chars; 401 if JWT-only caller without agent token state.

Register router in `main.py` next to other auth routers.

Workspace list change:

```python
rows = db.execute(
    select(Workspace, WorkspaceMember.is_favorite, WorkspaceMember.role)
    .join(...)
    ...
).all()
return [
    WorkspaceOut(..., is_favorite=is_favorite, role=role)
    for w, is_favorite, role in rows
]
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `cd codes/core-service && uv run pytest tests/test_agent_tokens.py tests/test_agent_token_crypto.py tests/test_agent_token_scopes.py -q`  
Also: `uv run ruff check app/services/agent_tokens.py app/routes/agent_tokens.py app/api/deps.py app/models/agent_token.py`

- [ ] **Step 5: Codegen + commit**

```bash
make codegen
git add codes/core-service codes/web/src/types/api/generated.ts
git commit -m "feat(core): agent token CRUD, audit, workspace role on list"
```

---

### Task 4: Scaffold `codes/mcp-server` package

**Files:**
- Create: `codes/mcp-server/pyproject.toml`
- Create: `codes/mcp-server/.env.example`
- Create: `codes/mcp-server/src/timia_mcp/__init__.py`
- Create: `codes/mcp-server/src/timia_mcp/__main__.py`
- Create: `codes/mcp-server/src/timia_mcp/config.py`
- Create: `codes/mcp-server/src/timia_mcp/errors.py`
- Create: `codes/mcp-server/src/timia_mcp/http_client.py`
- Create: `codes/mcp-server/tests/test_config.py`
- Create: `codes/mcp-server/tests/test_errors.py`

**Interfaces:**
- Produces:
  - `Settings` / `load_settings()` from env
  - `TimiaHttpClient` with `request(method, path, **kwargs) -> Any`
  - `tool_error_from_http(status: int, detail: Any) -> dict`
  - `json_result(data: Any) -> str`

- [ ] **Step 1: Write config + error tests**

```python
# tests/test_config.py
import pytest
from timia_mcp.config import load_settings


def test_load_settings_requires_api_base(monkeypatch):
    monkeypatch.delenv("TIMIA_API_BASE", raising=False)
    monkeypatch.delenv("TIMIA_PAT", raising=False)
    with pytest.raises(ValueError, match="TIMIA_API_BASE"):
        load_settings()


def test_load_settings_ok(monkeypatch):
    monkeypatch.setenv("TIMIA_API_BASE", "http://127.0.0.1:8000")
    monkeypatch.setenv("TIMIA_PAT", "tm_pat_test")
    monkeypatch.setenv("TIMIA_READONLY", "true")
    s = load_settings()
    assert s.api_base == "http://127.0.0.1:8000"
    assert s.readonly is True
    assert s.tool_profile == "p0"
```

```python
# tests/test_errors.py
from timia_mcp.errors import tool_error_from_http


def test_version_conflict():
    err = tool_error_from_http(409, "version_conflict")
    assert err["error"] == "version_conflict"
    assert err["http_status"] == 409
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd codes/mcp-server && uv sync && uv run pytest tests/test_config.py tests/test_errors.py -v`  
Expected: FAIL until package exists (`uv sync` first may fail without pyproject — create pyproject in step 3 before sync if needed: write pyproject first, then failing tests, then impl). Prefer: write pyproject + empty modules, then tests fail on assertions/imports of missing functions, then implement.

- [ ] **Step 3: Implement scaffold**

`pyproject.toml` essentials:

```toml
[project]
name = "timia-mcp-server"
version = "0.1.0"
requires-python = ">=3.11"
dependencies = [
  "mcp>=1.2",
  "httpx>=0.27",
  "pydantic>=2.6",
  "pydantic-settings>=2.2",
]

[project.scripts]
timia-mcp = "timia_mcp.server:main"

[dependency-groups]
dev = ["pytest>=8.0", "respx>=0.21", "ruff>=0.5"]

[build-system]
requires = ["hatchling"]
build-backend = "hatchling.build"

# src layout: directory is src/timia_mcp; after `uv sync`, `import timia_mcp` must work.
# If hatch does not pick it up, set:
# [tool.hatch.build.targets.wheel.force-include]
# "src/timia_mcp" = "timia_mcp"
[tool.hatch.build.targets.wheel]
packages = ["src/timia_mcp"]

[tool.ruff]
line-length = 100

[tool.pytest.ini_options]
pythonpath = ["src"]
testpaths = ["tests"]
```

`config.py`: fields `api_base`, `pat`, `readonly`, `tool_profile` (`p0|p1|full`), `timeout_seconds=30`, `default_timezone="Asia/Shanghai"`; strip trailing slash on `api_base`.

`errors.py`:

```python
def tool_error_from_http(status: int, detail: Any) -> dict:
    if status == 401:
        code = "unauthorized"
    elif status == 404:
        code = detail if isinstance(detail, str) else "not_found"
    elif status == 409:
        code = detail if isinstance(detail, str) else "version_conflict"
    elif status == 403:
        code = detail if isinstance(detail, str) else "forbidden"
    elif status == 400:
        code = detail if isinstance(detail, str) else "bad_request"
    else:
        code = "upstream_error"
    return {
        "error": code if isinstance(code, str) else "upstream_error",
        "http_status": status,
        "message": str(detail),
    }
```

`http_client.py`: `httpx.AsyncClient(base_url=..., headers={"Authorization": f"Bearer {pat}"}, timeout=...)`; method `async def request(...)` raises `TimiaHttpError(status, detail)` on non-2xx; parse FastAPI `{"detail": ...}`.

`__main__.py`: `from timia_mcp.server import main; main()` (server module filled in Task 5+).

- [ ] **Step 4: Pass tests + commit**

```bash
cd codes/mcp-server && uv run pytest tests/test_config.py tests/test_errors.py -q
git add codes/mcp-server
git commit -m "feat(mcp): scaffold timia-mcp package config and HTTP client"
```

---

### Task 5: MCP server core — profiles, readonly guard, audit hook, whoami

**Files:**
- Create: `codes/mcp-server/src/timia_mcp/profiles.py`
- Create: `codes/mcp-server/src/timia_mcp/auth.py`
- Create: `codes/mcp-server/src/timia_mcp/audit.py`
- Create: `codes/mcp-server/src/timia_mcp/server.py`
- Create: `codes/mcp-server/src/timia_mcp/tools/__init__.py`
- Create: `codes/mcp-server/src/timia_mcp/tools/profile.py`
- Create: `codes/mcp-server/tests/test_profile_tools.py`
- Create: `codes/mcp-server/tests/test_readonly_guard.py`
- Create: `codes/mcp-server/tests/conftest.py`

**Interfaces:**
- Produces:
  - `P0_TOOLS: set[str]` listing all Phase-0 tool names from spec §4.1
  - `is_tool_enabled(profile: str, name: str) -> bool`
  - `assert_writable(settings) -> None` raises readonly error dict producer
  - `emit_audit(client, tool_name, ok, error_detail, latency_ms, request_meta) -> None` best-effort
  - `build_mcp() -> FastMCP` (or `Server`) with registered tools for enabled profile
  - `main()` runs stdio

- [ ] **Step 1: Tests for whoami + readonly**

```python
# conftest.py
import pytest
import respx
from httpx import Response
from timia_mcp.config import Settings
from timia_mcp.http_client import TimiaHttpClient


@pytest.fixture
def settings():
    return Settings(
        api_base="http://timia.test",
        pat="tm_pat_test",
        readonly=False,
        tool_profile="p0",
        timeout_seconds=5,
        default_timezone="Asia/Shanghai",
    )


@pytest.fixture
def client(settings):
    return TimiaHttpClient(settings)
```

```python
# test_profile_tools.py
import respx
from httpx import Response
from timia_mcp.tools.profile import whoami_impl


@respx.mock
async def test_whoami(client):
    respx.get("http://timia.test/auth/me").mock(
        return_value=Response(
            200,
            json={
                "id": "u1",
                "email": "a@b.c",
                "display_name": "A",
                "system_role": "user",
            },
        )
    )
    out = await whoami_impl(client)
    assert out["email"] == "a@b.c"
    assert out["display_name"] == "A"
```

```python
# test_readonly_guard.py
from timia_mcp.auth import assert_writable
from timia_mcp.config import Settings
from timia_mcp.errors import ReadonlyError


def test_readonly_blocks_writes():
    s = Settings(api_base="http://x", pat="tm_pat_x", readonly=True, tool_profile="p0",
                 timeout_seconds=5, default_timezone="Asia/Shanghai")
    try:
        assert_writable(s)
        assert False, "expected ReadonlyError"
    except ReadonlyError as e:
        assert e.to_dict()["error"] == "readonly_mode"
```

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

`profiles.py`: `P0_TOOLS` = exact names:  
`whoami`, `list_workspaces`, `list_projects`, `get_schedule`, `get_schedule_dashboard`, `list_overdue`, `list_undated`, `list_priority`, `get_item`, `list_items`, `create_item`, `update_item`, `complete_item`, `parse_natural_language`, `get_workspace_dashboard`, `get_project_dashboard`, `get_activity`, `list_comments`, `add_comment`.

`p1`/`full` sets can be empty supersets stubs for now (`P1_TOOLS = P0_TOOLS | {...future}`).

`tools/profile.py`:

```python
async def whoami_impl(client: TimiaHttpClient) -> dict:
    data = await client.request("GET", "/auth/me")
    return {
        "id": data["id"],
        "email": data["email"],
        "display_name": data["display_name"],
        "system_role": data["system_role"],
    }
```

`server.py`: construct FastMCP(`"timia"`), hold shared settings/client on module or lifespan; register tools via thin wrappers that: time call → catch `TimiaHttpError` → `tool_error_from_http` → stderr JSON log → `emit_audit` → return `json.dumps(...)`.

Use SDK docs pattern:

```python
from mcp.server.fastmcp import FastMCP

mcp = FastMCP("timia")

def main() -> None:
    # load settings, attach client, register tools based on profile
    mcp.run(transport="stdio")
```

If FastMCP import path differs in installed `mcp` version, fall back to low-level `Server` **without changing tool names**.

- [ ] **Step 4: Pass tests + commit**

```bash
cd codes/mcp-server && uv run pytest tests/test_profile_tools.py tests/test_readonly_guard.py -q
git add codes/mcp-server
git commit -m "feat(mcp): server core with whoami, profiles, readonly, audit"
```

---

### Task 6: Workspace + schedule read tools

**Files:**
- Create: `codes/mcp-server/src/timia_mcp/tools/workspace.py`
- Create: `codes/mcp-server/src/timia_mcp/tools/schedule.py`
- Create: `codes/mcp-server/tests/test_workspace_tools.py`
- Create: `codes/mcp-server/tests/test_schedule_tools.py`
- Modify: `codes/mcp-server/src/timia_mcp/server.py` (register)

**Interfaces:**
- `list_workspaces_impl(client, favorite_only: bool=False) -> list[dict]`
- `list_projects_impl(client, workspace_id: str) -> list[dict]`
- `get_workspace_dashboard_impl(...)`, `get_project_dashboard_impl(...)`, `get_activity_impl(...)`
- `get_schedule_impl(...)`, `get_schedule_dashboard_impl()`, `list_overdue/undated/priority_impl(...)`
- Trim calendar payloads to `{id,title,status,start_at,end_at,project_id,workspace_id,priority}` (best-effort field pick from view JSON)

- [ ] **Step 1: Write respx tests** asserting URL path + query (`view=week`, `scope=me`) and trimmed keys

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement tools + register on FastMCP with English descriptions**

`list_workspaces` maps `GET /workspaces` → `{id, name, role, is_favorite}` using API fields `id`, `name`, `role` (added in Task 3), `is_favorite`.  
`favorite_only=True` filters client-side on `is_favorite`.

Schedule tools call:
- `GET /views/schedule/calendar`
- `GET /views/schedule/dashboard`
- `GET /views/schedule/overdue|undated|priority`

- [ ] **Step 4: Pass + commit**

```bash
cd codes/mcp-server && uv run pytest tests/test_workspace_tools.py tests/test_schedule_tools.py -q
git commit -am "feat(mcp): workspace and schedule read tools"
```

---

### Task 7: Item write/read tools + NL parse

**Files:**
- Create: `codes/mcp-server/src/timia_mcp/tools/items.py`
- Create: `codes/mcp-server/tests/test_items_tools.py`
- Modify: `server.py`

**Interfaces:**
- `get_item_impl`, `list_items_impl`, `create_item_impl`, `update_item_impl`, `complete_item_impl`, `parse_natural_language_impl`
- `complete_item` → PATCH with `{"version", "status": "done"}` (and `completed_at` if API accepts it; otherwise status only)
- `parse_natural_language` → `POST /views/schedule/natural-language/parse` with required fields from `NaturalLanguageParseRequest`: `{ text, timezone, reference_time, selected_date }` (`reference_time` ISO datetime, `selected_date` YYYY-MM-DD). Tool args should accept these four; default `timezone` to settings.default_timezone when omitted.

- [ ] **Step 1: Tests**

Cover: create posts to correct path; update sends `version`; 409 maps to `version_conflict`; readonly blocks `create_item_impl` via `assert_writable`; NL parse posts body.

- [ ] **Step 2: FAIL**

- [ ] **Step 3: Implement + register**

Return create/update summary `{id, version, title, start_at, end_at, status}`.

- [ ] **Step 4: Pass + commit**

```bash
git commit -am "feat(mcp): item CRUD, complete, and NL parse tools"
```

---

### Task 8: Comments tools + wire register_all + Makefile + docs

**Files:**
- Create: `codes/mcp-server/src/timia_mcp/tools/comments.py` (or fold into `workspace.py`)
- Modify: `codes/mcp-server/src/timia_mcp/tools/__init__.py` (`register_all(mcp, ctx)`)
- Create: `codes/mcp-server/README.md`
- Create: `codes/mcp-server/.env.example`
- Modify: `Makefile`
- Modify: `README.md` (root)
- Test: `codes/mcp-server/tests/test_comments_tools.py`

**Interfaces:**
- `list_comments` → `GET /workspaces/{ws}/projects/{pj}/items/{id}/comments`
- `add_comment` → `POST` same prefix with JSON `{ "body": str }` (`CommentCreate.body`)

- [ ] **Step 1: Comment tool tests + full `register_all` smoke (enabled tool names == P0 set)**

- [ ] **Step 2: Implement comments + README**

README must include:
1. `make mcp-server-install`
2. How to create PAT (`POST /auth/agent-tokens` with web JWT)
3. Cursor `mcp.json` example from spec
4. P0 tool table
5. Troubleshooting: 401 unauthorized, readonly_mode, version_conflict

Makefile:

```makefile
mcp-server-install:
	cd codes/mcp-server && UV_HTTP_TIMEOUT=$(UV_HTTP_TIMEOUT) uv sync

mcp-server-test: mcp-server-install
	cd codes/mcp-server && uv run pytest -q

.PHONY: ... mcp-server-install mcp-server-test
```

Root README: short **MCP (Agent)** section linking `codes/mcp-server/README.md` and the design spec.

- [ ] **Step 3: Full test suites**

```bash
cd codes/core-service && uv run pytest tests/test_agent_token_crypto.py tests/test_agent_token_scopes.py tests/test_agent_tokens.py -q
cd codes/mcp-server && uv run pytest -q
cd codes/core-service && uv run ruff check app/services/agent_tokens.py app/routes/agent_tokens.py app/api/deps.py app/models/agent_token.py
cd codes/mcp-server && uv run ruff check src tests
```

- [ ] **Step 4: Manual smoke (when DB up)**

```bash
make db && make core-service
# login/register → POST /auth/agent-tokens → export TIMIA_PAT / TIMIA_API_BASE
cd codes/mcp-server && uv run timia-mcp
# or configure Cursor mcp.json and call whoami / get_schedule / create_item
```

- [ ] **Step 5: Commit**

```bash
git add Makefile README.md codes/mcp-server
git commit -m "feat(mcp): comments tools, docs, and Makefile targets"
```

---

## Phase 0 acceptance checklist

- [ ] Migration `0033_agent_tokens` applies cleanly
- [ ] JWT user can create/list/revoke PAT; plaintext shown once
- [ ] PAT calls `/auth/me`, schedule views, item CRUD when scopes allow
- [ ] PAT denied on unlisted paths (`pat_path_not_allowed`) and missing scopes (`insufficient_scope`)
- [ ] `timia-mcp` stdio starts; Cursor can invoke `whoami`, `get_schedule`, `create_item`, `complete_item`
- [ ] `TIMIA_READONLY=true` blocks writes with `readonly_mode`
- [ ] Audit rows appear (best-effort) and stderr JSON logs exist
- [ ] No delete-workspace/project tools registered

---

## Out of this plan (later)

Phase 1: notes/plans tools, resources/prompts, Streamable HTTP, Web Agent Tokens UI, audit GET API  
Phase 2: health read tools, read-only PAT preset, optional PAT→JWT exchange
