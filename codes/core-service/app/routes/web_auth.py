"""Browser auth routes: login, refresh, logout, session list/revoke.

The RT lives in an HttpOnly cookie (`timia_rt`). It is NEVER returned in the
response body — that would defeat HttpOnly. The client receives the AT in the
body and uses it as `Authorization: Bearer ...` for subsequent API calls.

Refresh reads the RT from the cookie only, never from the body. This is what
makes the rotation safe: the body can't be intercepted by an XSS, only the
browser's cookie jar can.
"""

import uuid

from fastapi import APIRouter, Cookie, Depends, HTTPException, Request, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import verify_password
from app.db.deps import get_db
from app.models._mixins import utcnow
from app.models.user import User
from app.models.web_auth import WebSession
from app.schemas.web_auth import (
    WebLoginRequest,
    WebRefreshRequest,
    WebSessionOut,
    WebTokenOut,
)
from app.services.web_auth import (
    WebAuthError,
    create_web_session,
    new_request_id,
    refresh_web_session,
    revoke_all_web_sessions,
    revoke_web_session,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=WebTokenOut)
def login(
    payload: WebLoginRequest,
    request: Request,
    response: Response,
    db: Session = Depends(get_db),
) -> WebTokenOut:
    email = str(payload.email).strip().lower()
    user = db.scalar(select(User).where(User.email == email))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_credentials")
    if user.status != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="user_disabled")

    result = create_web_session(
        db,
        user=user,
        login_provider="password",
        last_ip=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )
    _set_refresh_cookie(response, result.refresh_token, result.refresh_token_expires_at)
    return WebTokenOut(
        access_token=result.access_token,
        expires_in=result.expires_in,
        session_id=result.session_id,
        refresh_token_expires_at=result.refresh_token_expires_at,
    )


@router.post("/refresh", response_model=WebTokenOut)
def refresh(
    payload: WebRefreshRequest,
    request: Request,
    response: Response,
    timia_rt: str | None = Cookie(default=None, alias=settings.web_cookie_name),
    db: Session = Depends(get_db),
) -> WebTokenOut:
    """Issue a fresh AT by rotating the RT cookie.

    The RT cookie is the single source of truth for which session is being
    refreshed. The client does not need to send a session id, which means
    `bootstrapSession()` works on a hard refresh (when in-memory state is
    gone) and on a new tab. The rotated RT cookie + new AT come back in the
    response; `session_id` is informational.
    """
    if not timia_rt:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing_refresh_token")

    session = db.scalar(
        select(WebSession).where(WebSession.refresh_token_hash == _quick_hash(timia_rt))
    )
    if not session:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_refresh_token")

    try:
        result = refresh_web_session(
            db,
            session_id=session.id,
            refresh_token=timia_rt,
            request_id=payload.request_id,
            last_ip=_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
    except WebAuthError as e:
        _clear_refresh_cookie(response)
        raise HTTPException(status_code=e.status_code, detail=e.detail)

    _set_refresh_cookie(response, result.refresh_token, result.refresh_token_expires_at)
    return WebTokenOut(
        access_token=result.access_token,
        expires_in=result.expires_in,
        session_id=result.session_id,
        refresh_token_expires_at=result.refresh_token_expires_at,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    response: Response,
    timia_rt: str | None = Cookie(default=None, alias=settings.web_cookie_name),
    db: Session = Depends(get_db),
):
    """Revoke the current session and clear the RT cookie.

    We must NOT return a new `Response` here — that would discard the
    `Set-Cookie` header we just put on the injected `response`. Returning
    `None` lets FastAPI build a 204 from the decorator's status_code and
    keep the headers we set.
    """
    if timia_rt:
        token_hash = _quick_hash(timia_rt)
        session = db.scalar(
            select(WebSession).where(
                (WebSession.refresh_token_hash == token_hash)
                | (WebSession.previous_refresh_token_hash == token_hash)
            )
        )
        if session and session.revoked_at is None:
            session.revoked_at = utcnow()
            session.revoke_reason = "logout"
            db.commit()
    _clear_refresh_cookie(response)


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT)
def logout_all(
    response: Response,
    timia_rt: str | None = Cookie(default=None, alias=settings.web_cookie_name),
    db: Session = Depends(get_db),
):
    """Revoke every web session for the current user."""
    if timia_rt:
        token_hash = _quick_hash(timia_rt)
        current = db.scalar(
            select(WebSession).where(WebSession.refresh_token_hash == token_hash)
        )
        if current and current.revoked_at is None:
            current.revoked_at = utcnow()
            current.revoke_reason = "logout_all"
            db.commit()
            revoke_all_web_sessions(db, user_id=current.user_id)
            db.commit()
    _clear_refresh_cookie(response)


@router.get("/sessions", response_model=list[WebSessionOut])
def list_sessions(
    timia_rt: str | None = Cookie(default=None, alias=settings.web_cookie_name),
    db: Session = Depends(get_db),
) -> list[WebSessionOut]:
    """Show all active web sessions for the current user, marking the caller."""
    if not timia_rt:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing_session")
    token_hash = _quick_hash(timia_rt)
    current = db.scalar(
        select(WebSession).where(WebSession.refresh_token_hash == token_hash)
    )
    if not current or current.revoked_at is not None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_session")

    rows = db.scalars(
        select(WebSession)
        .where(WebSession.user_id == current.user_id, WebSession.revoked_at.is_(None))
        .order_by(WebSession.last_used_at.desc())
    ).all()
    return [
        WebSessionOut(
            id=r.id,
            login_provider=r.login_provider,
            created_at=r.created_at,
            last_used_at=r.last_used_at,
            idle_expires_at=r.idle_expires_at,
            absolute_expires_at=r.absolute_expires_at,
            last_ip=r.last_ip,
            last_user_agent=r.last_user_agent,
            is_current=r.id == current.id,
        )
        for r in rows
    ]


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_session(
    session_id: uuid.UUID,
    timia_rt: str | None = Cookie(default=None, alias=settings.web_cookie_name),
    db: Session = Depends(get_db),
):
    if not timia_rt:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="missing_session")
    token_hash = _quick_hash(timia_rt)
    current = db.scalar(
        select(WebSession).where(WebSession.refresh_token_hash == token_hash)
    )
    if not current or current.revoked_at is not None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_session")
    if not revoke_web_session(db, session_id=session_id, user_id=current.user_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="session_not_found")


# --- helpers --------------------------------------------------------------


def _set_refresh_cookie(response: Response, value: str, expires_at) -> None:
    response.set_cookie(
        key=settings.web_cookie_name,
        value=value,
        max_age=int((expires_at - utcnow()).total_seconds()),
        httponly=True,
        secure=settings.web_cookie_secure,
        samesite=settings.web_cookie_samesite,
        path="/auth",
    )


def _clear_refresh_cookie(response: Response) -> None:
    response.delete_cookie(
        key=settings.web_cookie_name,
        path="/auth",
        httponly=True,
        secure=settings.web_cookie_secure,
        samesite=settings.web_cookie_samesite,
    )


def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",", 1)[0].strip()[:64]
    return request.client.host[:64] if request.client else None


def _quick_hash(token: str) -> str:
    import hashlib

    return hashlib.sha256(token.encode("utf-8")).hexdigest()
