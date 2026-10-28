import uuid
from urllib.parse import quote

from fastapi import APIRouter, Depends, Header, HTTPException, Request, Response, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.config import settings
from app.core.security import decode_access_token, verify_password
from app.db.deps import get_db
from app.models._mixins import utcnow
from app.models.mobile_auth import AuthIdentity, MobileDevice, MobileSession
from app.models.user import User
from app.schemas.mobile_auth import (
    MobileChallengeOut,
    MobileChallengeRequest,
    MobileDeviceOut,
    MobileDeviceRegisterRequest,
    MobilePasswordLoginRequest,
    MobileRefreshChallengeRequest,
    MobileRefreshRequest,
    MobileSessionOut,
    MobileTokenExchangeRequest,
    MobileTokenOut,
    OAuthLoginRequest,
    PhoneCodeOut,
    PhoneCodeRequest,
    PhoneLoginRequest,
)
from app.services.account_merge import AccountMergeError
from app.services.phone_numbers import PhoneNumberError, normalize_phone
from app.services.mobile_auth import (
    MobileAuthError,
    create_mobile_session,
    exchange_message,
    issue_challenge,
    login_message,
    oauth_login_message,
    phone_login_message,
    refresh_mobile_session,
    registration_message,
    require_device,
    verify_challenge,
    verify_device_signature,
)
from app.services.provider_auth import (
    ProviderAuthError,
    consume_phone_code,
    issue_phone_code,
    link_profile,
    login_with_profile,
    phone_profile,
    verify_google_login,
    verify_wechat_login,
)

router = APIRouter(prefix="/auth/mobile", tags=["mobile-auth"])


def _get_current_mobile_session(
    authorization: str | None = Header(default=None),
    db: Session = Depends(get_db),
) -> MobileSession:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="missing_token")
    try:
        payload = decode_access_token(authorization.split(" ", 1)[1].strip())
        if payload.get("aud") != settings.mobile_jwt_audience:
            raise ValueError
        session_id = uuid.UUID(payload["sid"])
        device_id = uuid.UUID(payload["did"])
        user_id = uuid.UUID(payload["sub"])
    except (KeyError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="invalid_mobile_token")
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
        raise HTTPException(status_code=401, detail="invalid_mobile_session")
    return mobile_session


@router.post("/devices/challenge", response_model=MobileChallengeOut)
def mobile_device_challenge(
    payload: MobileChallengeRequest,
    db: Session = Depends(get_db),
):
    if payload.purpose != "register":
        _handle(lambda: require_device(db, payload.installation_id), db)
    return issue_challenge(
        db,
        purpose=payload.purpose,
        installation_id=payload.installation_id,
    )


@router.post("/devices/register", response_model=MobileDeviceOut)
def register_mobile_device(
    payload: MobileDeviceRegisterRequest,
    db: Session = Depends(get_db),
):
    def register() -> MobileDeviceOut:
        verify_challenge(
            db,
            challenge_id=payload.challenge_id,
            nonce=payload.nonce,
            purpose="register",
            installation_id=payload.installation_id,
        )
        verify_device_signature(
            payload.public_key,
            payload.signature,
            registration_message(
                payload.challenge_id,
                payload.nonce,
                payload.installation_id,
                payload.public_key,
            ),
        )
        now = utcnow()
        device = db.scalar(
            select(MobileDevice).where(
                MobileDevice.installation_id == payload.installation_id
            )
        )
        if device:
            if device.public_key != payload.public_key:
                raise MobileAuthError("installation_already_registered", 409)
            device.disabled_at = None
        else:
            device = MobileDevice(
                installation_id=payload.installation_id,
                public_key=payload.public_key,
            )
            db.add(device)
        device.device_name = payload.device_name
        device.os_version = payload.os_version
        device.app_version = payload.app_version
        device.last_seen_at = now
        db.commit()
        return MobileDeviceOut(device_id=device.id, installation_id=device.installation_id)

    return _handle(register, db)


@router.post("/login/password", response_model=MobileTokenOut)
def mobile_password_login(
    payload: MobilePasswordLoginRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    def login() -> MobileTokenOut:
        email = str(payload.email).strip().lower()
        user = db.scalar(select(User).where(User.email == email))
        if not user or not verify_password(payload.password, user.password_hash):
            raise MobileAuthError("invalid_credentials")
        if user.status != "active":
            raise MobileAuthError("user_disabled", 403)
        device = require_device(db, payload.installation_id)
        verify_challenge(
            db,
            challenge_id=payload.challenge_id,
            nonce=payload.nonce,
            purpose="login",
            installation_id=payload.installation_id,
        )
        verify_device_signature(
            device.public_key,
            payload.signature,
            login_message(
                payload.challenge_id,
                payload.nonce,
                payload.installation_id,
                email,
            ),
        )
        identity = db.scalar(
            select(AuthIdentity).where(
                AuthIdentity.provider == "password",
                AuthIdentity.provider_tenant == "timia",
                AuthIdentity.provider_subject == email,
            )
        )
        if not identity:
            identity = AuthIdentity(
                user_id=user.id,
                provider="password",
                provider_tenant="timia",
                provider_subject=email,
                normalized_email=email,
                email_verified=True,
            )
            db.add(identity)
        identity.last_login_at = utcnow()
        return create_mobile_session(
            db,
            user=user,
            device=device,
            login_provider="password",
            last_ip=_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )

    return _handle(login, db)


@router.post("/login/phone/code", response_model=PhoneCodeOut, response_model_exclude_none=True)
def send_phone_code(payload: PhoneCodeRequest, db: Session = Depends(get_db)):
    def send() -> PhoneCodeOut:
        challenge_id, nonce, expires_at, dev_code = issue_phone_code(
            db, raw_phone=payload.phone, installation_id=payload.installation_id
        )
        return PhoneCodeOut(
            challenge_id=challenge_id,
            nonce=nonce,
            expires_at=expires_at,
            dev_code=dev_code,
        )

    return _handle(send, db)


@router.post("/login/phone/verify", response_model=MobileTokenOut)
def verify_phone_login(
    payload: PhoneLoginRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    def verify() -> MobileTokenOut:
        return _finish_phone_login(db, request, payload, current=None)

    return _handle(verify, db)


@router.post("/login/google", response_model=MobileTokenOut)
def google_login(
    payload: OAuthLoginRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    def login() -> MobileTokenOut:
        return _finish_oauth_login(db, request, payload, provider="google", current=None)

    return _handle(login, db)


@router.post("/login/wechat", response_model=MobileTokenOut)
def wechat_login(
    payload: OAuthLoginRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    def login() -> MobileTokenOut:
        return _finish_oauth_login(db, request, payload, provider="wechat", current=None)

    return _handle(login, db)


@router.post("/identities/phone", response_model=MobileTokenOut)
def link_phone_identity(
    payload: PhoneLoginRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    def link() -> MobileTokenOut:
        return _finish_phone_login(db, request, payload, current=user)

    return _handle(link, db)


@router.post("/identities/google", response_model=MobileTokenOut)
def link_google_identity(
    payload: OAuthLoginRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    def link() -> MobileTokenOut:
        return _finish_oauth_login(db, request, payload, provider="google", current=user)

    return _handle(link, db)


@router.post("/identities/wechat", response_model=MobileTokenOut)
def link_wechat_identity(
    payload: OAuthLoginRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    def link() -> MobileTokenOut:
        return _finish_oauth_login(db, request, payload, provider="wechat", current=user)

    return _handle(link, db)


@router.get("/oauth/{provider}/callback")
def oauth_app_callback(provider: str, code: str = "", state: str = ""):
    targets = {
        "google": "timia://oauth/google",
        "wechat": "timia://oauth/wechat",
    }
    base = targets.get(provider)
    if base is None:
        raise HTTPException(status_code=404, detail="not_found")
    target = f"{base}?code={quote(code, safe='')}&state={quote(state, safe='')}"
    return RedirectResponse(url=target, status_code=302)


@router.post("/token/exchange", response_model=MobileTokenOut)
def exchange_legacy_access_token(
    payload: MobileTokenExchangeRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    def exchange() -> MobileTokenOut:
        device = require_device(db, payload.installation_id)
        verify_challenge(
            db,
            challenge_id=payload.challenge_id,
            nonce=payload.nonce,
            purpose="exchange",
            installation_id=payload.installation_id,
        )
        verify_device_signature(
            device.public_key,
            payload.signature,
            exchange_message(
                payload.challenge_id,
                payload.nonce,
                payload.installation_id,
                user.id,
            ),
        )
        return create_mobile_session(
            db,
            user=user,
            device=device,
            login_provider="legacy_exchange",
            last_ip=_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        )

    return _handle(exchange, db)


@router.post("/token/refresh/challenge", response_model=MobileChallengeOut)
def mobile_refresh_challenge(
    payload: MobileRefreshChallengeRequest,
    db: Session = Depends(get_db),
):
    mobile_session = db.get(MobileSession, payload.session_id)
    if (
        not mobile_session
        or mobile_session.revoked_at is not None
        or mobile_session.device.installation_id != payload.installation_id
    ):
        raise HTTPException(status_code=401, detail="invalid_refresh_session")
    return issue_challenge(
        db,
        purpose="refresh",
        installation_id=payload.installation_id,
        session_id=payload.session_id,
    )


@router.post("/token/refresh", response_model=MobileTokenOut)
def refresh_mobile_token(
    payload: MobileRefreshRequest,
    request: Request,
    db: Session = Depends(get_db),
):
    return _handle(
        lambda: refresh_mobile_session(
            db,
            session_id=payload.session_id,
            installation_id=payload.installation_id,
            refresh_token=payload.refresh_token,
            request_id=payload.request_id,
            challenge_id=payload.challenge_id,
            nonce=payload.nonce,
            signature=payload.signature,
            last_ip=_client_ip(request),
            user_agent=request.headers.get("user-agent"),
        ),
        db,
    )


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout_mobile_session(
    mobile_session: MobileSession = Depends(_get_current_mobile_session),
    db: Session = Depends(get_db),
):
    mobile_session.revoked_at = utcnow()
    mobile_session.revoke_reason = "logout"
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT)
def logout_all_mobile_sessions(
    current: MobileSession = Depends(_get_current_mobile_session),
    db: Session = Depends(get_db),
):
    db.execute(
        update(MobileSession)
        .where(MobileSession.user_id == current.user_id, MobileSession.revoked_at.is_(None))
        .values(revoked_at=utcnow(), revoke_reason="logout_all")
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/sessions", response_model=list[MobileSessionOut])
def list_mobile_sessions(
    current: MobileSession = Depends(_get_current_mobile_session),
    db: Session = Depends(get_db),
):
    sessions = db.scalars(
        select(MobileSession)
        .where(
            MobileSession.user_id == current.user_id,
            MobileSession.revoked_at.is_(None),
        )
        .order_by(MobileSession.last_used_at.desc())
    ).all()
    return [_session_out(value, current.id) for value in sessions]


@router.delete("/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_mobile_session(
    session_id: uuid.UUID,
    current: MobileSession = Depends(_get_current_mobile_session),
    db: Session = Depends(get_db),
):
    target = db.get(MobileSession, session_id)
    if not target or target.user_id != current.user_id:
        raise HTTPException(status_code=404, detail="session_not_found")
    if target.revoked_at is None:
        target.revoked_at = utcnow()
        target.revoke_reason = "user_revoked"
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _session_out(value: MobileSession, current_id: uuid.UUID) -> MobileSessionOut:
    return MobileSessionOut(
        id=value.id,
        installation_id=value.device.installation_id,
        device_name=value.device.device_name,
        platform=value.device.platform,
        os_version=value.device.os_version,
        app_version=value.device.app_version,
        login_provider=value.login_provider,
        created_at=value.created_at,
        last_used_at=value.last_used_at,
        idle_expires_at=value.idle_expires_at,
        absolute_expires_at=value.absolute_expires_at,
        is_current=value.id == current_id,
    )


def _finish_phone_login(
    db: Session,
    request: Request,
    payload: PhoneLoginRequest,
    *,
    current: User | None,
) -> MobileTokenOut:
    try:
        phone = normalize_phone(payload.phone)
    except PhoneNumberError as exc:
        raise ProviderAuthError("invalid_phone", 400) from exc
    device = require_device(db, payload.installation_id)
    verify_device_signature(
        device.public_key,
        payload.signature,
        phone_login_message(
            payload.challenge_id,
            payload.nonce,
            payload.installation_id,
            phone,
            payload.code,
        ),
    )
    verified = consume_phone_code(
        db,
        challenge_id=payload.challenge_id,
        nonce=payload.nonce,
        raw_phone=phone,
        code=payload.code,
        installation_id=payload.installation_id,
    )
    profile = phone_profile(verified)
    user = link_profile(db, current, profile) if current else login_with_profile(db, profile)
    return create_mobile_session(
        db,
        user=user,
        device=device,
        login_provider="phone",
        last_ip=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )


def _finish_oauth_login(
    db: Session,
    request: Request,
    payload: OAuthLoginRequest,
    *,
    provider: str,
    current: User | None,
) -> MobileTokenOut:
    credential = _oauth_credential(payload)
    device = require_device(db, payload.installation_id)
    verify_challenge(
        db,
        challenge_id=payload.challenge_id,
        nonce=payload.nonce,
        purpose="oauth",
        installation_id=payload.installation_id,
    )
    verify_device_signature(
        device.public_key,
        payload.signature,
        oauth_login_message(
            payload.challenge_id,
            payload.nonce,
            payload.installation_id,
            provider,
            credential,
        ),
    )
    if provider == "google":
        profile = verify_google_login(
            id_token=payload.id_token,
            code=payload.code,
            redirect_uri=payload.redirect_uri,
            code_verifier=payload.code_verifier,
        )
    elif provider == "wechat":
        profile = verify_wechat_login(code=payload.code)
    else:
        raise ProviderAuthError("provider_not_configured", 503)
    user = link_profile(db, current, profile) if current else login_with_profile(db, profile)
    return create_mobile_session(
        db,
        user=user,
        device=device,
        login_provider=provider,
        last_ip=_client_ip(request),
        user_agent=request.headers.get("user-agent"),
    )


def _oauth_credential(payload: OAuthLoginRequest) -> str:
    if payload.id_token and payload.code:
        raise ProviderAuthError("invalid_provider_token", 400)
    if payload.id_token:
        return payload.id_token
    if payload.code:
        return payload.code
    raise ProviderAuthError("invalid_provider_token", 400)


def _handle(operation, db: Session):
    try:
        return operation()
    except (MobileAuthError, ProviderAuthError, AccountMergeError) as error:
        db.rollback()
        raise HTTPException(status_code=error.status_code, detail=error.detail)


def _client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",", 1)[0].strip()[:64]
    return request.client.host[:64] if request.client else None
