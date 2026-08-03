import uuid

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import decode_access_token
from app.db.deps import get_db
from app.models._mixins import utcnow
from app.models.mobile_auth import MobileSession
from app.models.user import SYSTEM_ROLE_ADMIN, User, user_id


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

    session_subject = payload.get("sid")
    device_subject = payload.get("did")
    if payload.get("aud") == settings.mobile_jwt_audience and (
        not session_subject or not device_subject
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_mobile_token"
        )

    if session_subject:
        try:
            session_id = uuid.UUID(session_subject)
        except (TypeError, ValueError):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_session"
            )
        mobile_session = db.get(MobileSession, session_id)
        now = utcnow()
        if (
            not mobile_session
            or mobile_session.user_id != user.id
            or mobile_session.revoked_at is not None
            or mobile_session.idle_expires_at <= now
            or mobile_session.absolute_expires_at <= now
        ):
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_session"
            )
        if device_subject:
            try:
                if mobile_session.device_id != uuid.UUID(device_subject):
                    raise ValueError
            except (TypeError, ValueError):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_device"
                )
    return user


def require_system_admin(user: User = Depends(get_current_user)) -> User:
    if user.system_role != SYSTEM_ROLE_ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="admin_required")
    return user
