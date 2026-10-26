"""APNs HTTP/2 provider. Keys come only from settings; missing keys do not send."""

from __future__ import annotations

import base64
import hashlib
import json
import logging
import time
from collections.abc import Callable
from dataclasses import dataclass

import httpx
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import ec
from cryptography.hazmat.primitives.asymmetric.utils import decode_dss_signature

from app.core.config import settings

logger = logging.getLogger(__name__)

SANDBOX_HOST = "api.sandbox.push.apple.com"
PRODUCTION_HOST = "api.push.apple.com"
INVALID_REASONS = {
    "BadDeviceToken",
    "Unregistered",
    "DeviceTokenNotForTopic",
    "TopicDisallowed",
}
# Provider tokens older than an hour are rejected. Refresh before that.
_TOKEN_TTL_SECONDS = 50 * 60

_http_client_factory: Callable[[], httpx.Client] | None = None
_cached_token: tuple[str, int, str] | None = None


def apns_is_configured() -> bool:
    return bool(
        settings.apns_key_id.strip()
        and settings.apns_team_id.strip()
        and settings.apns_bundle_id.strip()
        and settings.apns_key_p8.strip()
    )


def apns_environment() -> str:
    return "sandbox" if settings.apns_use_sandbox else "production"


def set_http_client_factory(factory: Callable[[], httpx.Client] | None) -> None:
    global _http_client_factory
    _http_client_factory = factory


def reset_provider_token_cache() -> None:
    global _cached_token
    _cached_token = None


def load_signing_key(raw: str):
    text = raw.strip().replace("\\n", "\n")
    if "BEGIN PRIVATE KEY" not in text:
        try:
            decoded = base64.b64decode(text, validate=True).decode("utf-8")
        except (ValueError, UnicodeDecodeError) as exc:
            raise ValueError("invalid_apns_key") from exc
        text = decoded.replace("\\n", "\n")
    if "BEGIN PRIVATE KEY" not in text:
        raise ValueError("invalid_apns_key")
    return serialization.load_pem_private_key(text.encode("utf-8"), password=None)


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def provider_token(now: float | None = None) -> str:
    """ES256 JWT for APNs. Apple rejects an ``exp`` claim, so only ``iss`` and ``iat``."""
    global _cached_token
    issued_at = int(now if now is not None else time.time())
    pem = settings.apns_key_p8.strip()
    fingerprint = hashlib.sha256(
        f"{settings.apns_key_id}:{settings.apns_team_id}:{pem}".encode()
    ).hexdigest()
    if _cached_token is not None:
        cached_fingerprint, cached_iat, cached = _cached_token
        if cached_fingerprint == fingerprint and issued_at - cached_iat < _TOKEN_TTL_SECONDS:
            return cached

    key = load_signing_key(pem)
    header = _b64url(
        json.dumps({"alg": "ES256", "kid": settings.apns_key_id.strip()}, separators=(",", ":")).encode()
    )
    payload = _b64url(
        json.dumps({"iss": settings.apns_team_id.strip(), "iat": issued_at}, separators=(",", ":")).encode()
    )
    signing_input = f"{header}.{payload}".encode()
    der_sig = key.sign(signing_input, ec.ECDSA(hashes.SHA256()))
    r_value, s_value = decode_dss_signature(der_sig)
    raw_sig = r_value.to_bytes(32, "big") + s_value.to_bytes(32, "big")
    token = f"{header}.{payload}.{_b64url(raw_sig)}"
    _cached_token = (fingerprint, issued_at, token)
    return token


@dataclass(frozen=True)
class ApnsMessage:
    token: str
    title: str
    body: str
    link: str | None


@dataclass(frozen=True)
class ApnsSendResult:
    token: str
    outcome: str  # sent | invalid | failed | transport
    status_code: int | None = None
    reason: str | None = None


def _classify(status_code: int, reason: str | None) -> str:
    if status_code == 200:
        return "sent"
    if status_code == 410 or (status_code == 400 and reason in INVALID_REASONS):
        return "invalid"
    # Auth/key and throttling can succeed on a later attempt.
    if status_code in (403, 429, 500, 503):
        if status_code == 403:
            reset_provider_token_cache()
        return "transport"
    return "failed"


def _reason(response: httpx.Response) -> str | None:
    try:
        body = response.json()
    except ValueError:
        return None
    if isinstance(body, dict):
        reason = body.get("reason")
        if isinstance(reason, str):
            return reason
    return None


def send_alerts(messages: list[ApnsMessage], *, jwt: str | None = None) -> list[ApnsSendResult]:
    if not messages:
        return []
    token = jwt or provider_token()
    host = SANDBOX_HOST if settings.apns_use_sandbox else PRODUCTION_HOST
    topic = settings.apns_bundle_id.strip()
    results: list[ApnsSendResult] = []
    with _open_client() as client:
        for message in messages:
            body: dict = {
                "aps": {
                    "alert": {"title": message.title[:200], "body": message.body[:2000]},
                    "sound": "default",
                }
            }
            if message.link:
                body["link"] = message.link
            headers = {
                "authorization": f"bearer {token}",
                "apns-topic": topic,
                "apns-push-type": "alert",
                "apns-priority": "10",
            }
            url = f"https://{host}/3/device/{message.token}"
            try:
                response = client.post(url, headers=headers, json=body)
            except httpx.HTTPError as exc:
                logger.warning("apns transport error: %s", type(exc).__name__)
                results.append(ApnsSendResult(token=message.token, outcome="transport"))
                continue
            reason = _reason(response)
            outcome = _classify(response.status_code, reason)
            if outcome != "sent":
                logger.info("apns status=%s reason=%s", response.status_code, reason)
            results.append(
                ApnsSendResult(
                    token=message.token,
                    outcome=outcome,
                    status_code=response.status_code,
                    reason=reason,
                )
            )
    return results


def _open_client() -> httpx.Client:
    if _http_client_factory is not None:
        return _http_client_factory()
    return httpx.Client(http2=True, timeout=httpx.Timeout(10.0))
