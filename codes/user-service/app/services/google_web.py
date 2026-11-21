"""Exchange a Google authorization code for the website OAuth client."""

from __future__ import annotations

import logging

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)

_ISSUERS = {"accounts.google.com", "https://accounts.google.com"}


class GoogleExchangeError(RuntimeError):
    def __init__(self, detail: str, status_code: int = 401):
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


def exchange_google_code(
    code: str, *, redirect_uri: str, code_verifier: str
) -> tuple[str, str, str | None, bool, str]:
    """Return (provider_tenant, subject, email, email_verified, display_stem)."""
    if settings.oauth_dev_mode and code.startswith("dev:google:"):
        return _dev_google(code)
    client_id = settings.google_web_client_id.strip()
    if not client_id or not settings.google_web_client_secret.strip():
        raise GoogleExchangeError("provider_not_configured", 503)
    id_token = _exchange(
        code,
        client_id=client_id,
        redirect_uri=redirect_uri,
        code_verifier=code_verifier,
    )
    return _profile(id_token, client_id=client_id)


def _dev_google(code: str) -> tuple[str, str, str | None, bool, str]:
    parts = code.split(":")
    # dev:google:{subject} or dev:google:{subject}:{email}
    if len(parts) < 3 or not parts[2].strip():
        raise GoogleExchangeError("invalid_provider_token")
    email = parts[3].strip().lower() if len(parts) > 3 and parts[3].strip() else None
    return ("google", parts[2].strip(), email, bool(email), "Google用户")


def _exchange(code: str, *, client_id: str, redirect_uri: str, code_verifier: str) -> str:
    payload = {
        "code": code,
        "client_id": client_id,
        "client_secret": settings.google_web_client_secret.strip(),
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
        "code_verifier": code_verifier,
    }
    try:
        response = httpx.post("https://oauth2.googleapis.com/token", data=payload, timeout=10)
    except httpx.HTTPError as exc:
        logger.warning("google code exchange failed: %s", type(exc).__name__)
        raise GoogleExchangeError("provider_unavailable", 503) from exc
    if response.status_code != 200:
        raise GoogleExchangeError("invalid_provider_token")
    id_token = str(response.json().get("id_token") or "")
    if not id_token:
        raise GoogleExchangeError("invalid_provider_token")
    return id_token


def _profile(token: str, *, client_id: str) -> tuple[str, str, str | None, bool, str]:
    try:
        response = httpx.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"id_token": token},
            timeout=10,
        )
    except httpx.HTTPError as exc:
        logger.warning("google tokeninfo failed: %s", type(exc).__name__)
        raise GoogleExchangeError("provider_unavailable", 503) from exc
    if response.status_code != 200:
        raise GoogleExchangeError("invalid_provider_token")
    data = response.json()
    audience = str(data.get("aud") or "")
    issuer = str(data.get("iss") or "")
    subject = str(data.get("sub") or "")
    if audience != client_id:
        raise GoogleExchangeError("invalid_provider_audience")
    if issuer not in _ISSUERS or not subject:
        raise GoogleExchangeError("invalid_provider_token")
    email = str(data.get("email") or "").strip().lower() or None
    verified_raw = data.get("email_verified")
    verified = verified_raw is True or str(verified_raw or "").lower() == "true"
    name = " ".join(str(data.get("name") or "").split())[:40]
    return ("google", subject, email, verified, name or "Google用户")
