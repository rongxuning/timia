"""Phone, Google, and WeChat identities on top of mobile device sessions.

Unauthenticated login finds or creates the identity's user.
An authenticated link attaches a free identity, or merges when it belongs to
someone else. The earlier user survives. See account_merge.py.
"""

from __future__ import annotations

import hmac
import logging
import secrets
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

import httpx
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models._mixins import utcnow
from app.models.mobile_auth import AuthChallenge, AuthIdentity
from app.models.user import SYSTEM_ROLE_USER, User
from app.services.account_merge import merge_accounts, resolve_active_user
from app.services.mobile_auth import require_device, secret_hash
from app.services.phone_numbers import PhoneNumberError, mask_phone, normalize_phone

logger = logging.getLogger(__name__)

PHONE_CODE_TTL = timedelta(minutes=5)
PHONE_RESEND_WINDOW = timedelta(seconds=60)
PHONE_MAX_ATTEMPTS = 5
PHONE_DAILY_LIMIT = 10
DEVICE_DAILY_LIMIT = 20
PRODUCTION_GOOGLE_REDIRECT = (
    "https://timia.online/core-service/auth/mobile/oauth/google/callback"
)
_GOOGLE_SUFFIX = ".apps.googleusercontent.com"


class ProviderAuthError(RuntimeError):
    def __init__(self, detail: str, status_code: int = 401):
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


@dataclass(frozen=True)
class ProviderProfile:
    provider: str
    provider_tenant: str
    subject: str
    email: str | None = None
    email_verified: bool = False
    phone: str | None = None
    phone_verified: bool = False
    display_name: str | None = None


def issue_phone_code(
    db: Session, *, raw_phone: str, installation_id: str
) -> tuple[uuid.UUID, str, datetime, str | None]:
    phone = _phone(raw_phone)
    require_device(db, installation_id)
    _enforce_phone_rate_limits(db, phone, installation_id)
    code = f"{secrets.randbelow(1_000_000):06d}"
    nonce = secrets.token_urlsafe(48)
    now = utcnow()
    challenge = AuthChallenge(
        id=uuid.uuid4(),
        purpose="phone_code",
        installation_id=installation_id,
        subject=phone,
        nonce_hash=secret_hash(nonce),
        code_hash=secret_hash(code),
        expires_at=now + PHONE_CODE_TTL,
    )
    db.add(challenge)
    db.flush()
    dev_code = dispatch_sms(phone, code)
    challenge_id = challenge.id
    expires_at = challenge.expires_at
    db.commit()
    return challenge_id, nonce, expires_at, dev_code


def consume_phone_code(
    db: Session,
    *,
    challenge_id: uuid.UUID,
    nonce: str,
    raw_phone: str,
    code: str,
    installation_id: str,
) -> str:
    phone = _phone(raw_phone)
    challenge = db.scalar(
        select(AuthChallenge).where(AuthChallenge.id == challenge_id).with_for_update()
    )
    now = utcnow()
    if (
        not challenge
        or challenge.purpose != "phone_code"
        or challenge.installation_id != installation_id
        or challenge.subject != phone
        or challenge.consumed_at is not None
        or challenge.expires_at <= now
        or not _digest_equal(challenge.nonce_hash, secret_hash(nonce))
    ):
        raise ProviderAuthError("invalid_challenge")
    challenge.attempt_count += 1
    if challenge.attempt_count > PHONE_MAX_ATTEMPTS:
        challenge.consumed_at = now
        db.commit()
        raise ProviderAuthError("invalid_code")
    if not challenge.code_hash or not _digest_equal(challenge.code_hash, secret_hash(code)):
        # Persist the counter. The route rolls back the request after this error.
        db.commit()
        raise ProviderAuthError("invalid_code")
    challenge.consumed_at = now
    return phone


def phone_profile(phone: str) -> ProviderProfile:
    return ProviderProfile(
        provider="phone",
        provider_tenant="timia",
        subject=phone,
        phone=phone,
        phone_verified=True,
    )


def verify_google_login(
    *,
    id_token: str | None,
    code: str | None,
    redirect_uri: str | None,
    code_verifier: str | None,
) -> ProviderProfile:
    if id_token:
        return _google_profile_from_token(id_token)
    if not code:
        raise ProviderAuthError("invalid_provider_token", 400)
    if settings.oauth_dev_mode and code.startswith("dev:google:"):
        return _dev_google(code)
    _assert_google_redirect(redirect_uri)
    token = _exchange_google_code(code, redirect_uri or "", code_verifier or "")
    return _google_profile_from_token(token)


def verify_wechat_login(*, code: str | None) -> ProviderProfile:
    if not code:
        raise ProviderAuthError("invalid_provider_token", 400)
    if settings.oauth_dev_mode and code.startswith("dev:wechat:"):
        subject = code.split(":", 2)[2].strip()
        if not subject:
            raise ProviderAuthError("invalid_provider_token")
        return ProviderProfile(provider="wechat", provider_tenant="wechat", subject=subject)
    if not settings.wechat_app_id or not settings.wechat_app_secret:
        raise ProviderAuthError("provider_not_configured", 503)
    return _exchange_wechat_code(code)


def login_with_profile(db: Session, profile: ProviderProfile) -> User:
    identity = _lock_identity(db, profile)
    if identity is None:
        return _create_user_with_identity(db, profile)
    user = _active_owner(db, identity)
    identity.user_id = user.id
    identity.last_login_at = utcnow()
    return user


def link_profile(db: Session, current: User, profile: ProviderProfile) -> User:
    current = resolve_active_user(db, current)
    if current.status != "active":
        raise ProviderAuthError("user_disabled", 403)
    identity = _lock_identity(db, profile)
    if identity is None:
        _add_identity(db, current, profile)
        db.flush()
        return current
    owner = _active_owner(db, identity)
    if owner.id == current.id:
        identity.user_id = owner.id
        identity.last_login_at = utcnow()
        return owner
    survivor = merge_accounts(db, current, owner)
    healed = _lock_identity(db, profile)
    if healed is not None:
        healed.last_login_at = utcnow()
    return survivor


def dispatch_sms(phone: str, code: str) -> str | None:
    provider = (settings.sms_provider or "").strip().lower()
    if not provider:
        logger.info("sms dev stub phone=%s code=%s", mask_phone(phone), code)
        return code
    if provider != "http" or not settings.sms_http_url:
        raise ProviderAuthError("sms_not_configured", 503)
    headers = {}
    if settings.sms_http_token:
        headers["Authorization"] = f"Bearer {settings.sms_http_token}"
    try:
        response = httpx.post(
            settings.sms_http_url,
            json={
                "phone": phone,
                "code": code,
                "sign_name": settings.sms_sign_name,
                "template_code": settings.sms_template_code,
            },
            headers=headers,
            timeout=10,
        )
        response.raise_for_status()
    except httpx.HTTPError as exc:
        logger.warning("sms provider request failed: %s", type(exc).__name__)
        raise ProviderAuthError("sms_unavailable", 503) from exc
    return None


def allowed_google_redirects() -> set[str]:
    allowed = {PRODUCTION_GOOGLE_REDIRECT}
    configured = settings.google_redirect_uri.strip()
    if configured:
        allowed.add(configured)
    for client_id in settings.google_client_id_list:
        if client_id.endswith(_GOOGLE_SUFFIX):
            prefix = client_id[: -len(_GOOGLE_SUFFIX)]
            allowed.add(f"com.googleusercontent.apps.{prefix}:/oauth2redirect")
    return allowed


def _phone(raw: str) -> str:
    try:
        return normalize_phone(raw)
    except PhoneNumberError as exc:
        raise ProviderAuthError("invalid_phone", 400) from exc


def _enforce_phone_rate_limits(db: Session, phone: str, installation_id: str) -> None:
    now = utcnow()
    recent = db.scalar(
        select(func.count())
        .select_from(AuthChallenge)
        .where(
            AuthChallenge.purpose == "phone_code",
            AuthChallenge.subject == phone,
            AuthChallenge.created_at > now - PHONE_RESEND_WINDOW,
        )
    )
    if recent:
        raise ProviderAuthError("resend_too_soon", 429)
    day_start = now - timedelta(days=1)
    phone_count = db.scalar(
        select(func.count())
        .select_from(AuthChallenge)
        .where(
            AuthChallenge.purpose == "phone_code",
            AuthChallenge.subject == phone,
            AuthChallenge.created_at > day_start,
        )
    )
    device_count = db.scalar(
        select(func.count())
        .select_from(AuthChallenge)
        .where(
            AuthChallenge.purpose == "phone_code",
            AuthChallenge.installation_id == installation_id,
            AuthChallenge.created_at > day_start,
        )
    )
    if (phone_count or 0) >= PHONE_DAILY_LIMIT or (device_count or 0) >= DEVICE_DAILY_LIMIT:
        raise ProviderAuthError("phone_rate_limited", 429)


def _lock_identity(db: Session, profile: ProviderProfile) -> AuthIdentity | None:
    return db.scalar(
        select(AuthIdentity)
        .where(
            AuthIdentity.provider == profile.provider,
            AuthIdentity.provider_tenant == profile.provider_tenant,
            AuthIdentity.provider_subject == profile.subject,
        )
        .with_for_update()
    )


def _active_owner(db: Session, identity: AuthIdentity) -> User:
    owner = db.get(User, identity.user_id)
    if owner is None:
        raise ProviderAuthError("user_disabled", 403)
    owner = resolve_active_user(db, owner)
    if owner.status != "active":
        raise ProviderAuthError("user_disabled", 403)
    return owner


def _create_user_with_identity(db: Session, profile: ProviderProfile) -> User:
    user = User(
        email=None,
        password_hash=None,
        display_name=_allocate_display_name(db, profile),
        status="active",
        system_role=SYSTEM_ROLE_USER,
    )
    db.add(user)
    db.flush()
    _add_identity(db, user, profile)
    db.flush()
    return user


def _add_identity(db: Session, user: User, profile: ProviderProfile) -> AuthIdentity:
    identity = AuthIdentity(
        user_id=user.id,
        provider=profile.provider,
        provider_tenant=profile.provider_tenant,
        provider_subject=profile.subject,
        normalized_email=(profile.email or None),
        normalized_phone=profile.phone,
        email_verified=profile.email_verified,
        phone_verified=profile.phone_verified,
        last_login_at=utcnow(),
    )
    db.add(identity)
    return identity


def _allocate_display_name(db: Session, profile: ProviderProfile) -> str:
    stem = _display_stem(profile)[:100] or "用户"
    for index in range(30):
        candidate = stem if index == 0 else f"{stem[:90]}-{index}"
        taken = db.scalar(select(User.id).where(User.display_name == candidate))
        if taken is None:
            return candidate
    return f"{stem[:80]}-{uuid.uuid4().hex[:12]}"


def _display_stem(profile: ProviderProfile) -> str:
    if profile.provider == "phone" and profile.phone:
        digits = profile.phone.lstrip("+")
        local = digits[2:] if digits.startswith("86") and len(digits) > 4 else digits
        return f"手机{local[-4:]}"
    custom = (profile.display_name or "").strip()
    if custom:
        return custom[:40]
    if profile.provider == "wechat":
        return "微信用户"
    if profile.provider == "google":
        return "Google用户"
    return "用户"


def _google_profile_from_token(token: str) -> ProviderProfile:
    if settings.oauth_dev_mode and token.startswith("dev:google:"):
        return _dev_google(token)
    if not settings.google_client_id_list:
        raise ProviderAuthError("provider_not_configured", 503)
    try:
        response = httpx.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"id_token": token},
            timeout=10,
        )
    except httpx.HTTPError as exc:
        logger.warning("google tokeninfo failed: %s", type(exc).__name__)
        raise ProviderAuthError("provider_unavailable", 503) from exc
    if response.status_code != 200:
        raise ProviderAuthError("invalid_provider_token")
    data = response.json()
    audience = str(data.get("aud") or "")
    issuer = str(data.get("iss") or "")
    subject = str(data.get("sub") or "")
    if audience not in settings.google_client_id_list:
        raise ProviderAuthError("invalid_provider_audience")
    if issuer not in {"accounts.google.com", "https://accounts.google.com"} or not subject:
        raise ProviderAuthError("invalid_provider_token")
    email = str(data.get("email") or "").strip().lower() or None
    verified = str(data.get("email_verified") or "").lower() == "true"
    return ProviderProfile(
        provider="google",
        provider_tenant="google",
        subject=subject,
        email=email,
        email_verified=verified,
    )


def _dev_google(token: str) -> ProviderProfile:
    parts = token.split(":")
    # dev:google:{subject} or dev:google:{subject}:{email}
    if len(parts) < 3 or not parts[2].strip():
        raise ProviderAuthError("invalid_provider_token")
    email = parts[3].strip().lower() if len(parts) > 3 and parts[3].strip() else None
    return ProviderProfile(
        provider="google",
        provider_tenant="google",
        subject=parts[2].strip(),
        email=email,
        email_verified=bool(email),
    )


def _assert_google_redirect(redirect_uri: str | None) -> None:
    if not redirect_uri or redirect_uri not in allowed_google_redirects():
        raise ProviderAuthError("invalid_redirect_uri", 400)


def _exchange_google_code(code: str, redirect_uri: str, code_verifier: str) -> str:
    client_ids = settings.google_client_id_list
    if not client_ids:
        raise ProviderAuthError("provider_not_configured", 503)
    payload = {
        "code": code,
        "client_id": client_ids[0],
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
        "code_verifier": code_verifier,
    }
    if settings.google_client_secret:
        payload["client_secret"] = settings.google_client_secret
    try:
        response = httpx.post("https://oauth2.googleapis.com/token", data=payload, timeout=10)
    except httpx.HTTPError as exc:
        logger.warning("google code exchange failed: %s", type(exc).__name__)
        raise ProviderAuthError("provider_unavailable", 503) from exc
    if response.status_code != 200:
        raise ProviderAuthError("invalid_provider_token")
    id_token = str(response.json().get("id_token") or "")
    if not id_token:
        raise ProviderAuthError("invalid_provider_token")
    return id_token


def _exchange_wechat_code(code: str) -> ProviderProfile:
    try:
        response = httpx.get(
            "https://api.weixin.qq.com/sns/oauth2/access_token",
            params={
                "appid": settings.wechat_app_id,
                "secret": settings.wechat_app_secret,
                "code": code,
                "grant_type": "authorization_code",
            },
            timeout=10,
        )
    except httpx.HTTPError as exc:
        logger.warning("wechat code exchange failed: %s", type(exc).__name__)
        raise ProviderAuthError("provider_unavailable", 503) from exc
    data = response.json()
    if data.get("errcode"):
        raise ProviderAuthError("invalid_provider_token")
    openid = str(data.get("openid") or "")
    unionid = str(data.get("unionid") or "")
    access_token = str(data.get("access_token") or "")
    if not unionid and access_token and openid:
        try:
            info = httpx.get(
                "https://api.weixin.qq.com/sns/userinfo",
                params={"access_token": access_token, "openid": openid, "lang": "zh_CN"},
                timeout=10,
            ).json()
        except httpx.HTTPError as exc:
            logger.warning("wechat userinfo failed: %s", type(exc).__name__)
            raise ProviderAuthError("provider_unavailable", 503) from exc
        unionid = str(info.get("unionid") or "")
        openid = str(info.get("openid") or openid)
    if unionid:
        return ProviderProfile(provider="wechat", provider_tenant="wechat", subject=unionid)
    if not openid:
        raise ProviderAuthError("invalid_provider_token")
    return ProviderProfile(
        provider="wechat",
        provider_tenant=settings.wechat_app_id,
        subject=openid,
    )


def _digest_equal(left: str, right: str) -> bool:
    return hmac.compare_digest(left, right)
