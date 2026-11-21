"""Website Google login. The browser ends on /login with the refresh cookie set."""

from __future__ import annotations

import base64
import hashlib
import hmac
import secrets
from datetime import UTC, datetime
from urllib.parse import quote, urlencode

from fastapi import APIRouter, Cookie, Depends, Request
from fastapi.responses import RedirectResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.deps import get_db
from app.models._mixins import utcnow
from app.services.google_web import GoogleExchangeError, exchange_google_code
from app.services.web_session import WebLoginError, login_provider_web

router = APIRouter(tags=["google-web"])

STATE_COOKIE = "timia_gg_state"
VERIFIER_COOKIE = "timia_gg_verifier"
STATE_MAX_AGE = 600


def _error(detail: str) -> RedirectResponse:
    return RedirectResponse(url=f"/login?google_error={quote(detail, safe='')}", status_code=302)


def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",", 1)[0].strip()[:64]
    return request.client.host[:64] if request.client else None


@router.get("/auth/google/web/start")
def google_web_start() -> RedirectResponse:
    client_id = settings.google_web_client_id.strip()
    secret = settings.google_web_client_secret.strip()
    redirect_uri = settings.google_web_redirect_uri.strip()
    if not client_id or not secret or not redirect_uri:
        return _error("provider_not_configured")
    state = secrets.token_urlsafe(24)
    verifier, challenge = _pkce()
    query = urlencode(
        {
            "client_id": client_id,
            "redirect_uri": redirect_uri,
            "response_type": "code",
            "scope": "openid email profile",
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "state": state,
            "prompt": "select_account",
        }
    )
    response = RedirectResponse(
        url=f"https://accounts.google.com/o/oauth2/v2/auth?{query}",
        status_code=302,
    )
    _set_secret(response, STATE_COOKIE, state)
    _set_secret(response, VERIFIER_COOKIE, verifier)
    return response


@router.get("/auth/google/web/callback")
def google_web_callback(
    request: Request,
    code: str = "",
    state: str = "",
    timia_gg_state: str | None = Cookie(default=None, alias=STATE_COOKIE),
    timia_gg_verifier: str | None = Cookie(default=None, alias=VERIFIER_COOKIE),
    db: Session = Depends(get_db),
) -> RedirectResponse:
    redirect_uri = settings.google_web_redirect_uri.strip()
    if not _state_matches(state, timia_gg_state) or not code or not timia_gg_verifier or not redirect_uri:
        return _clear_secrets(_error("invalid_state"))
    try:
        tenant, subject, email, email_verified, display_stem = exchange_google_code(
            code,
            redirect_uri=redirect_uri,
            code_verifier=timia_gg_verifier,
        )
        refresh_token, expires_at = login_provider_web(
            db,
            provider="google",
            provider_tenant=tenant,
            provider_subject=subject,
            display_stem=display_stem,
            normalized_email=email,
            email_verified=email_verified,
            last_ip=_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )
    except (GoogleExchangeError, WebLoginError) as exc:
        db.rollback()
        return _clear_secrets(_error(exc.detail))
    response = RedirectResponse(url="/login?google=1", status_code=302)
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
    return _clear_secrets(response)


def _pkce() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(48)
    digest = hashlib.sha256(verifier.encode()).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    return verifier, challenge


def _set_secret(response: RedirectResponse, key: str, value: str) -> None:
    response.set_cookie(
        key=key,
        value=value,
        max_age=STATE_MAX_AGE,
        httponly=True,
        secure=settings.web_cookie_secure,
        samesite=settings.cookie_samesite,
        path="/auth",
    )


def _aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value


def _state_matches(state: str, cookie: str | None) -> bool:
    if not state or not cookie or len(state) != len(cookie):
        return False
    return hmac.compare_digest(state, cookie)


def _clear_secrets(response: RedirectResponse) -> RedirectResponse:
    for key in (STATE_COOKIE, VERIFIER_COOKIE):
        response.delete_cookie(
            key=key,
            path="/auth",
            httponly=True,
            secure=settings.web_cookie_secure,
            samesite=settings.cookie_samesite,
        )
    return response
