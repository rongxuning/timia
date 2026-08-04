import uuid

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import decode_access_token
from app.db.deps import get_db
from app.models._mixins import utcnow
from app.models.mobile_auth import MobileSession
from app.models.user import SYSTEM_ROLE_ADMIN, User, user_id
from app.models.web_auth import WebSession


def get_current_user(
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing_token")
    token = authorization.split(" ", 1)[1].strip()
    try:
        payload = decode_access_token(token)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_token")

    try:
        uid: uuid.UUID = user_id(payload["sub"])
    except Exception:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_subject")

    user = db.get(User, uid)
    if not user or user.status != "active":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="user_disabled")

    audience = payload.get("aud")
    session_subject = payload.get("sid")
    device_subject = payload.get("did")

    if audience == settings.mobile_jwt_audience:
        if not session_subject or not device_subject:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_mobile_token"
            )
        _check_mobile_session(db, user.id, session_subject, device_subject)
    elif audience == settings.jwt_audience:
        if session_subject:
            _check_web_session(db, user.id, session_subject)
    # Other audiences (none today) pass through with just user-level checks.

    return user


def _check_mobile_session(
    db: Session, user_id: uuid.UUID, session_subject: str, device_subject: str
) -> None:
    try:
        session_id = uuid.UUID(session_subject)
        device_id = uuid.UUID(device_subject)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_session"
        )
    mobile_session = db.get(MobileSession, session_id)
    now = utcnow()
    if (
        not mobile_session
        or mobile_session.user_id != user_id
        or mobile_session.device_id != device_id
        or mobile_session.revoked_at is not None
        or mobile_session.idle_expires_at <= now
        or mobile_session.absolute_expires_at <= now
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_session"
        )


def _check_web_session(db: Session, user_id: uuid.UUID, session_subject: str) -> None:
    """Web sessions are server-side state, but for fast-path 401s we re-check
    expiry on every request. Idle timeout is reset by `/auth/refresh` (which
    hits `WebSession.idle_expires_at`), not by ordinary API calls."""
    try:
        session_id = uuid.UUID(session_subject)
    except (TypeError, ValueError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_session"
        )
    web_session = db.get(WebSession, session_id)
    now = utcnow()
    if (
        not web_session
        or web_session.user_id != user_id
        or web_session.revoked_at is not None
        or web_session.absolute_expires_at <= now
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_session"
        )


def require_system_admin(user: User = Depends(get_current_user)) -> User:
    if user.system_role != SYSTEM_ROLE_ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="admin_required")
    return user
