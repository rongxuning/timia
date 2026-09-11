from __future__ import annotations

import hashlib
import secrets

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.agent_token import AgentToken
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
