from __future__ import annotations

import hashlib
import secrets

from app.core.config import settings

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
