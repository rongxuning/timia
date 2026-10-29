"""Phone, Google, and WeChat identities on top of mobile device sessions.

Unauthenticated login finds or creates the identity's user.
An authenticated link attaches a free identity. If that identity already
belongs to someone else, the caller must re-prove the current account before
the earlier user survives the merge. See account_merge.py.
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
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import verify_password
from app.models._mixins import utcnow
from app.models.mobile_auth import AuthChallenge, AuthIdentity
from app.models.user import SYSTEM_ROLE_USER, User
from app.services.account_merge import merge_accounts, resolve_active_user
from app.services.mobile_auth import require_device, secret_hash
from app.services.phone_numbers import PhoneNumberError, mask_phone, normalize_phone
from app.services.wechat_credentials import (
    WeChatClient,
    select_wechat_credentials,
    wechat_identity_key,
)

logger = logging.getLogger(__name__)

PHONE_CODE_TTL = timedelta(minutes=5)
PHONE_RESEND_WINDOW = timedelta(seconds=60)
PHONE_MAX_ATTEMPTS = 5
PHONE_DAILY_LIMIT = 10
DEVICE_DAILY_LIMIT = 20
PRODUCTION_GOOGLE_REDIRECT = "https://timia.online/core-service/auth/mobile/oauth/google/callback"
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


@dataclass(frozen=True)
class StepUpProof:
    """Re-proof of the account that holds the access token, required before a merge."""

    password: str | None = None
    provider: str | None = None
    phone: str | None = None
    code: str | None = None
    challenge_id: uuid.UUID | None = None
    nonce: str | None = None
    installation_id: str | None = None
    id_token: str | None = None
    oauth_code: str | None = None

    def offered(self) -> bool:
        return bool((self.password or "").strip() or self.provider)


def issue_phone_code(
    db: Session, *, raw_phone: str, installation_id: str
) -> tuple[uuid.UUID, str, datetime, str | None]:
    phone = _phone(raw_phone)
    require_device(db, installation_id)
    _enforce_phone_rate_limits(db, phone, installation_id)
    if _sms_dispatch_mode() == "unconfigured":
        # Fail before a code exists so nothing can be logged or returned.
        raise ProviderAuthError("sms_not_configured", 503)
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
    challenge_id = challenge.id
    expires_at = challenge.expires_at
    # Count the attempt even if the gateway later rejects the send.
    db.commit()
    dev_code = dispatch_sms(phone, code)
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


def verify_wechat_login(*, code: str | None, client: WeChatClient = "mobile") -> ProviderProfile:
    if not code:
        raise ProviderAuthError("invalid_provider_token", 400)
    if settings.oauth_dev_mode and code.startswith("dev:wechat:"):
        subject = code.split(":", 2)[2].strip()
        if not subject:
            raise ProviderAuthError("invalid_provider_token")
        return ProviderProfile(provider="wechat", provider_tenant="wechat", subject=subject)
    app_id, secret = _wechat_credentials(client)
    if not app_id or not secret:
        raise ProviderAuthError("provider_not_configured", 503)
    return _exchange_wechat_code(code, app_id=app_id, secret=secret)


def _wechat_credentials(client: WeChatClient) -> tuple[str, str]:
    return select_wechat_credentials(
        client,
        web_app_id=settings.wechat_web_app_id,
        web_app_secret=settings.wechat_web_app_secret,
        mobile_app_id=settings.wechat_mobile_app_id,
        mobile_app_secret=settings.wechat_mobile_app_secret,
        legacy_app_id=settings.wechat_app_id,
        legacy_app_secret=settings.wechat_app_secret,
    )


def login_with_profile(db: Session, profile: ProviderProfile) -> User:
    identity = _lock_identity(db, profile)
    if identity is not None:
        return _touch_login(db, identity)
    try:
        with db.begin_nested():
            user = _create_user_with_identity(db, profile)
    except IntegrityError as exc:
        if not _is_identity_conflict(exc):
            raise
        identity = _lock_identity(db, profile)
        if identity is None:
            raise
        return _touch_login(db, identity)
    return user


def link_profile(
    db: Session,
    current: User,
    profile: ProviderProfile,
    *,
    step_up: StepUpProof | None = None,
) -> User:
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
        return _touch_login(db, identity)
    # Prove the token holder before any merge. Proving only the surviving
    # account is not enough: an older attacker account would otherwise absorb
    # the token's user.
    require_current_account_step_up(db, current, step_up)
    survivor = merge_accounts(db, current, owner)
    healed = _lock_identity(db, profile)
    if healed is not None:
        healed.last_login_at = utcnow()
    return survivor


def require_current_account_step_up(db: Session, current: User, proof: StepUpProof | None) -> None:
    if proof is None or not proof.offered():
        raise ProviderAuthError("step_up_required", 403)
    if (proof.password or "").strip():
        if verify_password(proof.password or "", current.password_hash):
            return
        raise ProviderAuthError("step_up_failed", 403)
    if proof.provider == "phone":
        _prove_existing_phone(db, current, proof)
        return
    if proof.provider in {"google", "wechat"}:
        _prove_existing_oauth(db, current, proof)
        return
    raise ProviderAuthError("step_up_required", 403)


def sms_dev_stub_enabled() -> bool:
    """OTP may leave the server only behind an explicit dev switch."""
    if settings.sms_dev_return_code:
        return True
    return (settings.environment or "").strip().lower() == "development"


def dispatch_sms(phone: str, code: str) -> str | None:
    mode = _sms_dispatch_mode()
    if mode == "dev":
        logger.info("sms dev stub phone=%s code=%s", mask_phone(phone), code)
        return code
    if mode != "http":
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


def _sms_dispatch_mode() -> str:
    provider = (settings.sms_provider or "").strip().lower()
    if sms_dev_stub_enabled() and provider in {"", "dev"}:
        return "dev"
    if provider == "http" and (settings.sms_http_url or "").strip():
        return "http"
    return "unconfigured"


def _touch_login(db: Session, identity: AuthIdentity) -> User:
    user = _active_owner(db, identity)
    identity.user_id = user.id
    identity.last_login_at = utcnow()
    return user


def _is_identity_conflict(exc: IntegrityError) -> bool:
    orig = exc.orig
    diag = getattr(orig, "diag", None)
    name = getattr(diag, "constraint_name", None) if diag is not None else None
    if name == "uq_auth_identity_provider_subject":
        return True
    return "uq_auth_identity_provider_subject" in str(orig or exc)


def _prove_existing_phone(db: Session, current: User, proof: StepUpProof) -> None:
    if not (
        proof.phone and proof.code and proof.challenge_id and proof.nonce and proof.installation_id
    ):
        raise ProviderAuthError("step_up_required", 403)
    phone = consume_phone_code(
        db,
        challenge_id=proof.challenge_id,
        nonce=proof.nonce,
        raw_phone=proof.phone,
        code=proof.code,
        installation_id=proof.installation_id,
    )
    _require_identity_owner(db, current, phone_profile(phone))


def _prove_existing_oauth(db: Session, current: User, proof: StepUpProof) -> None:
    if proof.provider == "google":
        profile = verify_google_login(
            id_token=proof.id_token,
            code=proof.oauth_code,
            redirect_uri=None,
            code_verifier=None,
        )
    elif proof.provider == "wechat":
        code = proof.oauth_code or proof.id_token
        profile = verify_wechat_login(code=code)
    else:
        raise ProviderAuthError("step_up_required", 403)
    if profile.provider != proof.provider:
        raise ProviderAuthError("step_up_failed", 403)
    _require_identity_owner(db, current, profile)


def _require_identity_owner(db: Session, current: User, profile: ProviderProfile) -> None:
    identity = _lock_identity(db, profile)
    if identity is None:
        raise ProviderAuthError("step_up_failed", 403)
    owner = _active_owner(db, identity)
    if owner.id != current.id:
        raise ProviderAuthError("step_up_failed", 403)


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


def _exchange_wechat_code(code: str, *, app_id: str, secret: str) -> ProviderProfile:
    try:
        response = httpx.get(
            "https://api.weixin.qq.com/sns/oauth2/access_token",
            params={
                "appid": app_id,
                "secret": secret,
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
    key = wechat_identity_key(unionid=unionid, openid=openid, app_id=app_id)
    if key is None:
        raise ProviderAuthError("invalid_provider_token")
    tenant, subject = key
    return ProviderProfile(provider="wechat", provider_tenant=tenant, subject=subject)


def _digest_equal(left: str, right: str) -> bool:
    return hmac.compare_digest(left, right)
