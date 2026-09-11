from __future__ import annotations

import hashlib
import secrets
import uuid
from datetime import datetime

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.agent_token import AgentToken, AgentToolCall
from app.models._mixins import utcnow
from app.models.user import User
from app.schemas.agent_tokens import AgentTokenOut

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


def token_to_out(row: AgentToken) -> AgentTokenOut:
    return AgentTokenOut(
        id=str(row.id),
        name=row.name,
        token_prefix=row.token_prefix,
        scopes=list(row.scopes or []),
        expires_at=row.expires_at,
        revoked_at=row.revoked_at,
        last_used_at=row.last_used_at,
        created_at=row.created_at,
    )


def create_agent_token(
    db: Session,
    *,
    user_id: uuid.UUID,
    name: str,
    scopes: list[str] | None = None,
    expires_at: datetime | None = None,
) -> tuple[AgentToken, str]:
    full, prefix, hashed = generate_pat()
    row = AgentToken(
        user_id=user_id,
        name=name,
        token_prefix=prefix,
        token_hash=hashed,
        scopes=list(scopes if scopes is not None else DEFAULT_SCOPES),
        expires_at=expires_at,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row, full


def list_agent_tokens(db: Session, user_id: uuid.UUID) -> list[AgentToken]:
    return list(
        db.scalars(
            select(AgentToken)
            .where(AgentToken.user_id == user_id)
            .order_by(AgentToken.created_at.desc())
        ).all()
    )


def revoke_agent_token(db: Session, *, user_id: uuid.UUID, token_id: uuid.UUID) -> bool:
    row = db.scalar(
        select(AgentToken).where(AgentToken.id == token_id, AgentToken.user_id == user_id)
    )
    if row is None:
        return False
    row.revoked_at = utcnow()
    db.add(row)
    db.commit()
    return True


def _truncate_request_meta(meta: dict) -> dict:
    out: dict = {}
    for key, value in meta.items():
        if isinstance(value, str) and len(value) > 200:
            out[key] = value[:200]
        elif isinstance(value, dict):
            out[key] = _truncate_request_meta(value)
        else:
            out[key] = value
    return out


def record_tool_call_audit(
    db: Session,
    *,
    user_id: uuid.UUID,
    token_id: uuid.UUID,
    tool_name: str,
    ok: bool,
    error_detail: str | None,
    latency_ms: int,
    request_meta: dict,
) -> AgentToolCall:
    row = AgentToolCall(
        user_id=user_id,
        token_id=token_id,
        tool_name=tool_name,
        ok=ok,
        error_detail=error_detail,
        latency_ms=latency_ms,
        request_meta=_truncate_request_meta(request_meta),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row
