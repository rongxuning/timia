"""Create a browser session in the shared web_sessions table.

The refresh-token derivation matches core-service so POST /auth/refresh,
which still runs in core during this phase, accepts the cookie.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import uuid
from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models._mixins import utcnow
from app.models.identity import AuthIdentity, User, WebSession


class WebLoginError(RuntimeError):
    def __init__(self, detail: str, status_code: int = 401):
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


def secret_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def derive_refresh_token(session_id: uuid.UUID, generation: int) -> str:
    message = f"timia-web-refresh-token:{session_id}:{generation}".encode()
    digest = hmac.new(settings.jwt_secret.encode(), message, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


def user_agent_fingerprint(user_agent: str | None) -> str | None:
    if not user_agent:
        return None
    return hashlib.sha256(user_agent.encode("utf-8")).hexdigest()


def login_wechat_web(
    db: Session,
    *,
    provider_tenant: str,
    provider_subject: str,
    last_ip: str | None,
    user_agent: str | None,
) -> tuple[str, datetime]:
    """Find or create the WeChat user and return (refresh_token, idle_expires_at)."""
    for _ in range(4):
        now = utcnow()
        identity = _lock_identity(db, provider_tenant, provider_subject)
        if identity is not None:
            user = _user_for_identity(db, identity)
            identity.user_id = user.id
            identity.last_login_at = now
            return _create_web_session(
                db, user=user, last_ip=last_ip, user_agent=user_agent
            )
        try:
            with db.begin_nested():
                user = _create_user(db)
                identity = AuthIdentity(
                    user_id=user.id,
                    provider="wechat",
                    provider_tenant=provider_tenant,
                    provider_subject=provider_subject,
                    email_verified=False,
                    phone_verified=False,
                    last_login_at=now,
                )
                db.add(identity)
                db.flush()
        except IntegrityError as exc:
            # A retried callback can lose to the identity unique key, or to
            # display_name, because the user row is flushed first.
            if _is_identity_conflict(exc) or _is_display_name_conflict(exc):
                continue
            raise
        else:
            return _create_web_session(
                db, user=user, last_ip=last_ip, user_agent=user_agent
            )
    raise WebLoginError("identity_conflict", 409)


def _lock_identity(
    db: Session, provider_tenant: str, provider_subject: str
) -> AuthIdentity | None:
    statement = select(AuthIdentity).where(
        AuthIdentity.provider == "wechat",
        AuthIdentity.provider_tenant == provider_tenant,
        AuthIdentity.provider_subject == provider_subject,
    )
    if db.get_bind().dialect.name != "sqlite":
        statement = statement.with_for_update()
    return db.scalar(statement)


def _user_for_identity(db: Session, identity: AuthIdentity) -> User:
    owner = db.get(User, identity.user_id)
    if owner is None:
        raise WebLoginError("user_disabled", 403)
    user = _resolve_active_user(db, owner)
    if user.status != "active":
        raise WebLoginError("user_disabled", 403)
    return user


def _integrity_text(exc: IntegrityError) -> str:
    orig = exc.orig
    diag = getattr(orig, "diag", None)
    name = getattr(diag, "constraint_name", None) if diag is not None else None
    return f"{name or ''} {orig or exc}"


def _is_identity_conflict(exc: IntegrityError) -> bool:
    text = _integrity_text(exc)
    return "uq_auth_identity_provider_subject" in text or "auth_identities.provider" in text


def _is_display_name_conflict(exc: IntegrityError) -> bool:
    text = _integrity_text(exc)
    return (
        "ix_users_display_name" in text
        or "users_display_name_key" in text
        or "users.display_name" in text
    )


def _resolve_active_user(db: Session, user: User) -> User:
    seen: set[uuid.UUID] = set()
    current = user
    while current.status == "merged" and current.merged_into_user_id:
        if current.id in seen:
            break
        seen.add(current.id)
        nxt = db.get(User, current.merged_into_user_id)
        if nxt is None:
            break
        current = nxt
    return current


def _create_user(db: Session) -> User:
    user = User(
        email=None,
        password_hash=None,
        display_name=_allocate_display_name(db),
        status="active",
        system_role="user",
        week_starts_on=1,
    )
    db.add(user)
    db.flush()
    return user


def _allocate_display_name(db: Session) -> str:
    stem = "微信用户"
    for index in range(30):
        candidate = stem if index == 0 else f"{stem}-{index}"
        taken = db.scalar(select(User.id).where(User.display_name == candidate))
        if taken is None:
            return candidate
    return f"{stem}-{uuid.uuid4().hex[:12]}"


def _create_web_session(
    db: Session,
    *,
    user: User,
    last_ip: str | None,
    user_agent: str | None,
) -> tuple[str, datetime]:
    now = utcnow()
    absolute_expires_at = now + timedelta(days=settings.web_session_absolute_days)
    idle_expires_at = min(
        now + timedelta(days=settings.web_session_idle_days),
        absolute_expires_at,
    )
    web_session = WebSession(
        user_id=user.id,
        login_provider="wechat",
        refresh_token_hash="pending",
        token_family_id=uuid.uuid4(),
        refresh_generation=0,
        last_used_at=now,
        idle_expires_at=idle_expires_at,
        absolute_expires_at=absolute_expires_at,
        last_ip=(last_ip or None),
        last_user_agent=(user_agent or None),
        user_agent_fingerprint=user_agent_fingerprint(user_agent),
    )
    db.add(web_session)
    db.flush()
    refresh_token = derive_refresh_token(web_session.id, 0)
    web_session.refresh_token_hash = secret_hash(refresh_token)
    db.commit()
    return refresh_token, web_session.idle_expires_at
