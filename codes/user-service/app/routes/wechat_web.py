"""Website-app QR login. The browser ends on /login with the refresh cookie set."""

from __future__ import annotations

import hmac
import secrets
from datetime import UTC, datetime
from urllib.parse import quote

from fastapi import APIRouter, Cookie, Depends, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.deps import get_db
from app.models._mixins import utcnow
from app.services.web_session import WebLoginError, login_wechat_web
from app.services.wechat_credentials import qrconnect_url
from app.services.wechat_web import WeChatExchangeError, credentials_for, exchange_wechat_code

router = APIRouter(tags=["wechat-web"])

STATE_COOKIE = "timia_wx_state"
STATE_MAX_AGE = 600


def _error(detail: str) -> RedirectResponse:
    return RedirectResponse(url=f"/login?wechat_error={quote(detail, safe='')}", status_code=302)


def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",", 1)[0].strip()[:64]
    return request.client.host[:64] if request.client else None


@router.get("/auth/wechat/web/start")
def wechat_web_start() -> RedirectResponse:
    app_id, secret = credentials_for("web")
    redirect_uri = settings.wechat_web_redirect_uri.strip()
    if not app_id or not secret or not redirect_uri:
        return _error("provider_not_configured")
    state = secrets.token_urlsafe(24)
    response = RedirectResponse(
        url=qrconnect_url(app_id=app_id, redirect_uri=redirect_uri, state=state),
        status_code=302,
    )
    response.set_cookie(
        key=STATE_COOKIE,
        value=state,
        max_age=STATE_MAX_AGE,
        httponly=True,
        secure=settings.web_cookie_secure,
        samesite=settings.cookie_samesite,
        path="/auth",
    )
    return response


@router.get("/auth/wechat/web/callback")
def wechat_web_callback(
    request: Request,
    code: str = "",
    state: str = "",
    timia_wx_state: str | None = Cookie(default=None, alias=STATE_COOKIE),
    db: Session = Depends(get_db),
) -> RedirectResponse:
    if not _state_matches(state, timia_wx_state) or not code:
        return _clear_state(_error("invalid_state"))
    try:
        tenant, subject = exchange_wechat_code(code, client="web")
        refresh_token, expires_at = login_wechat_web(
            db,
            provider_tenant=tenant,
            provider_subject=subject,
            last_ip=_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
    except (WeChatExchangeError, WebLoginError) as exc:
        db.rollback()
        return _clear_state(_error(exc.detail))
    response = RedirectResponse(url="/login?wechat=1", status_code=302)
    max_age = int((_aware(expires_at) - utcnow()).total_seconds())
    response.set_cookie(
        key=settings.web_cookie_name,
        value=refresh_token,
        max_age=max(max_age, 0),
        httponly=True,
        secure=settings.web_cookie_secure,
        samesite=settings.cookie_samesite,
        path="/auth",
    )
    return _clear_state(response)


def _aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


def _state_matches(state: str, cookie: str | None) -> bool:
    if not state or not cookie or len(state) != len(cookie):
        return False
    return hmac.compare_digest(state, cookie)


def _clear_state(response: RedirectResponse) -> RedirectResponse:
    response.delete_cookie(
        key=STATE_COOKIE,
        path="/auth",
        httponly=True,
        secure=settings.web_cookie_secure,
        samesite=settings.cookie_samesite,
    )
    return response
