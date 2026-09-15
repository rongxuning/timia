from __future__ import annotations

import uuid

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import PAT_PREFIX, decode_access_token
from app.db.deps import get_db
from app.models._mixins import utcnow
from app.models.identity import MobileSession, User, WebSession
from app.services.permissions import session_is_expired


def get_current_user(
    db: Session = Depends(get_db),
    authorization: str | None = Header(default=None),
) -> User:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing_token")
    token = authorization.split(" ", 1)[1].strip()
    if token.startswith(PAT_PREFIX):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_token")
    try:
        payload = decode_access_token(token)
    except ValueError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_token")

    try:
        uid = uuid.UUID(payload["sub"])
    except (TypeError, ValueError, KeyError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_token")

    user = db.get(User, uid)
    if not user or user.status != "active":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="user_disabled")

    audience = payload.get("aud")
    session_subject = payload.get("sid")
    device_subject = payload.get("did")
    now = utcnow()

    if audience == settings.mobile_jwt_audience:
        if not session_subject or not device_subject:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_token")
        try:
            session_id = uuid.UUID(session_subject)
            device_id = uuid.UUID(device_subject)
        except ValueError:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_session")
        mobile = db.get(MobileSession, session_id)
        if (
            not mobile
            or mobile.user_id != user.id
            or mobile.device_id != device_id
            or mobile.revoked_at is not None
            or session_is_expired(mobile.idle_expires_at)
            or session_is_expired(mobile.absolute_expires_at)
        ):
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_session")
    elif audience == settings.jwt_audience:
        if session_subject:
            try:
                session_id = uuid.UUID(session_subject)
            except ValueError:
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_session")
            web = db.get(WebSession, session_id)
            if (
                not web
                or web.user_id != user.id
                or web.revoked_at is not None
                or session_is_expired(web.absolute_expires_at)
            ):
                raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_session")
    _ = now
    return user


def require_internal_token(x_internal_token: str | None = Header(default=None, alias="X-Internal-Token")) -> None:
    if not x_internal_token or x_internal_token != settings.file_internal_token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_token")
