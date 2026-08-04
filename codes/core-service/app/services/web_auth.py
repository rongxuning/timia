"""Web session service — long-lived browser sessions via refresh-token rotation.

Design mirrors `mobile_auth.py` but without the device keypair / ECDSA layer.
The HttpOnly + Secure + SameSite refresh-token cookie is the real binding;
the soft `user_agent_fingerprint` is informational only and is not enforced,
because browsers (especially mobile) rotate IPs and user-agent strings.

Security properties:
  * RT is single-use. Every refresh rotates both the access and refresh token.
  * RT is derived deterministically from (session_id, generation) via HMAC, so
    we never need to store the cleartext token.
  * On every refresh we record the previous RT hash. If a refresh request ever
    presents an already-rotated RT, we revoke the whole token family — this
    catches token theft in flight (legitimate client kept the new RT, attacker
    replayed the old one).
  * An idempotent retry within `web_refresh_retry_grace_seconds` (same
    `request_id` + same previous hash) returns the same rotated RT instead of
    revoking — covers transient network failures.
  * Idle timeout (`web_session_idle_days`) is reset on every successful
    refresh; absolute timeout (`web_session_absolute_days`) is not.
"""

import base64
import hashlib
import hmac
import secrets
import uuid
from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_access_token
from app.models._mixins import utcnow
from app.models.user import User
from app.models.web_auth import WebSession
from app.schemas.web_auth import WebTokenOut


@dataclass
class _InternalToken:
    """Service-level result. Carries the cleartext RT so the route can set the
    HttpOnly cookie; the schema strips it for the response body."""

    access_token: str
    expires_in: int
    session_id: uuid.UUID
    refresh_token: str
    refresh_token_expires_at: object


def secret_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def user_agent_fingerprint(user_agent: str | None) -> str | None:
    if not user_agent:
        return None
    return hashlib.sha256(user_agent.encode("utf-8")).hexdigest()


def derive_refresh_token(session_id: uuid.UUID, generation: int) -> str:
    """Deterministic RT per (session, generation). HMAC-SHA256 over the secret."""
    message = f"timia-web-refresh-token:{session_id}:{generation}".encode()
    digest = hmac.new(settings.jwt_secret.encode(), message, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


def create_web_session(
    db: Session,
    *,
    user: User,
    login_provider: str = "password",
    last_ip: str | None,
    user_agent: str | None,
) -> _InternalToken:
    now = utcnow()
    absolute_expires_at = now + timedelta(days=settings.web_session_absolute_days)
    idle_expires_at = min(
        now + timedelta(days=settings.web_session_idle_days),
        absolute_expires_at,
    )
    web_session = WebSession(
        id=uuid.uuid4(),
        user_id=user.id,
        login_provider=login_provider,
        refresh_token_hash="pending",
        token_family_id=uuid.uuid4(),
        refresh_generation=0,
        last_used_at=now,
        idle_expires_at=idle_expires_at,
        absolute_expires_at=absolute_expires_at,
        last_ip=last_ip,
        last_user_agent=user_agent,
        user_agent_fingerprint=user_agent_fingerprint(user_agent),
    )
    refresh_token = derive_refresh_token(web_session.id, 0)
    web_session.refresh_token_hash = secret_hash(refresh_token)
    db.add(web_session)
    db.commit()
    return _token_response(web_session, refresh_token)


def refresh_web_session(
    db: Session,
    *,
    session_id: uuid.UUID,
    refresh_token: str,
    request_id: str,
    last_ip: str | None,
    user_agent: str | None,
) -> _InternalToken:
    web_session = db.scalar(
        select(WebSession).where(WebSession.id == session_id).with_for_update()
    )
    now = utcnow()
    if not web_session or web_session.revoked_at is not None:
        raise WebAuthError("invalid_refresh_session")

    if web_session.idle_expires_at <= now or web_session.absolute_expires_at <= now:
        web_session.revoked_at = now
        web_session.revoke_reason = "expired"
        db.commit()
        raise WebAuthError("refresh_session_expired")

    user = db.get(User, web_session.user_id)
    if not user or user.status != "active":
        web_session.revoked_at = now
        web_session.revoke_reason = "account_disabled"
        db.commit()
        raise WebAuthError("invalid_refresh_session")

    presented_hash = secret_hash(refresh_token)
    if hmac.compare_digest(presented_hash, web_session.refresh_token_hash):
        # Happy path: rotate.
        web_session.previous_refresh_token_hash = web_session.refresh_token_hash
        web_session.refresh_generation += 1
        rotated_token = derive_refresh_token(
            web_session.id, web_session.refresh_generation
        )
        web_session.refresh_token_hash = secret_hash(rotated_token)
        web_session.last_rotation_request_id = request_id
        web_session.last_rotated_at = now
    elif _is_idempotent_refresh_retry(web_session, presented_hash, request_id, now):
        # The same client retried within the grace window. Return the already-rotated token.
        rotated_token = derive_refresh_token(
            web_session.id, web_session.refresh_generation
        )
    else:
        # A presented RT we have never issued (or that was already used beyond
        # the grace window) is a token-theft signal. Burn the whole family.
        web_session.revoked_at = now
        web_session.revoke_reason = "refresh_replay"
        _revoke_family(db, web_session.token_family_id, now, "refresh_replay")
        db.commit()
        raise WebAuthError("refresh_token_reused")

    web_session.last_used_at = now
    web_session.last_ip = last_ip
    web_session.last_user_agent = user_agent
    web_session.idle_expires_at = min(
        now + timedelta(days=settings.web_session_idle_days),
        web_session.absolute_expires_at,
    )
    db.commit()
    return _token_response(web_session, rotated_token)


def revoke_web_session(
    db: Session,
    *,
    session_id: uuid.UUID,
    user_id: uuid.UUID,
    reason: str = "user_revoked",
) -> bool:
    target = db.get(WebSession, session_id)
    if not target or target.user_id != user_id or target.revoked_at is not None:
        return False
    target.revoked_at = utcnow()
    target.revoke_reason = reason
    db.commit()
    return True


def revoke_all_web_sessions(
    db: Session, *, user_id: uuid.UUID, except_session_id: uuid.UUID | None = None
) -> int:
    now = utcnow()
    stmt = (
        update(WebSession)
        .where(WebSession.user_id == user_id, WebSession.revoked_at.is_(None))
        .values(revoked_at=now, revoke_reason="logout_all")
    )
    if except_session_id is not None:
        stmt = stmt.where(WebSession.id != except_session_id)
    result = db.execute(stmt)
    db.commit()
    return result.rowcount or 0


def _revoke_family(db: Session, family_id: uuid.UUID, now, reason: str) -> None:
    db.execute(
        update(WebSession)
        .where(WebSession.token_family_id == family_id, WebSession.revoked_at.is_(None))
        .values(revoked_at=now, revoke_reason=reason)
    )


def _is_idempotent_refresh_retry(
    web_session: WebSession,
    presented_hash: str,
    request_id: str,
    now,
) -> bool:
    """A retried refresh from the same client should not trigger family revocation.

    True iff: the presented hash matches the *previous* (just-rotated) hash, the
    request id matches the one that originally rotated it, and the rotation
    happened within the grace window.
    """
    if (
        not web_session.previous_refresh_token_hash
        or not hmac.compare_digest(
            presented_hash, web_session.previous_refresh_token_hash
        )
        or web_session.last_rotation_request_id != request_id
        or web_session.last_rotated_at is None
    ):
        return False
    return (
        now - web_session.last_rotated_at
    ).total_seconds() <= settings.web_refresh_retry_grace_seconds


def _token_response(web_session: WebSession, refresh_token: str) -> _InternalToken:
    access_token = create_access_token(
        str(web_session.user_id),
        audience=settings.jwt_audience,
        expires_minutes=settings.web_access_token_expires_minutes,
        session_id=str(web_session.id),
    )
    return _InternalToken(
        access_token=access_token,
        expires_in=settings.web_access_token_expires_minutes * 60,
        refresh_token=refresh_token,
        refresh_token_expires_at=web_session.idle_expires_at,
        session_id=web_session.id,
    )


def new_request_id() -> str:
    """Per-request idempotency key the client must echo on refresh."""
    return secrets.token_urlsafe(32)


class WebAuthError(RuntimeError):
    def __init__(self, detail: str, status_code: int = 401):
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code
