import base64
import hashlib
import hmac
import secrets
import uuid
from datetime import timedelta

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import ec
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.security import create_access_token
from app.models._mixins import utcnow
from app.models.mobile_auth import AuthChallenge, MobileDevice, MobileSession
from app.models.user import User
from app.schemas.mobile_auth import MobileChallengeOut, MobileTokenOut


class MobileAuthError(RuntimeError):
    def __init__(self, detail: str, status_code: int = 401):
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


def secret_hash(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()


def public_key_hash(public_key: str) -> str:
    return hashlib.sha256(_decode_base64(public_key)).hexdigest()


def registration_message(
    challenge_id: uuid.UUID,
    nonce: str,
    installation_id: str,
    public_key: str,
) -> bytes:
    return (
        f"timia-device-register\n{challenge_id}\n{nonce}\n{installation_id}\n"
        f"{public_key_hash(public_key)}"
    ).encode()


def login_message(
    challenge_id: uuid.UUID,
    nonce: str,
    installation_id: str,
    email: str,
) -> bytes:
    return (
        f"timia-mobile-login\n{challenge_id}\n{nonce}\n{installation_id}\n"
        f"{secret_hash(email.strip().lower())}"
    ).encode()


def exchange_message(
    challenge_id: uuid.UUID,
    nonce: str,
    installation_id: str,
    user_id: uuid.UUID,
) -> bytes:
    return (
        f"timia-mobile-exchange\n{challenge_id}\n{nonce}\n{installation_id}\n{user_id}"
    ).encode()


def refresh_message(
    challenge_id: uuid.UUID,
    nonce: str,
    installation_id: str,
    session_id: uuid.UUID,
    request_id: str,
    refresh_token: str,
) -> bytes:
    return (
        f"timia-mobile-refresh\n{challenge_id}\n{nonce}\n{installation_id}\n"
        f"{session_id}\n{request_id}\n{secret_hash(refresh_token)}"
    ).encode()


def issue_challenge(
    db: Session,
    *,
    purpose: str,
    installation_id: str,
    session_id: uuid.UUID | None = None,
) -> MobileChallengeOut:
    nonce = secrets.token_urlsafe(48)
    now = utcnow()
    challenge = AuthChallenge(
        id=uuid.uuid4(),
        purpose=purpose,
        installation_id=installation_id,
        session_id=session_id,
        nonce_hash=secret_hash(nonce),
        expires_at=now + timedelta(minutes=settings.mobile_challenge_expires_minutes),
    )
    db.add(challenge)
    db.commit()
    return MobileChallengeOut(
        challenge_id=challenge.id,
        nonce=nonce,
        expires_at=challenge.expires_at,
    )


def verify_challenge(
    db: Session,
    *,
    challenge_id: uuid.UUID,
    nonce: str,
    purpose: str,
    installation_id: str,
    session_id: uuid.UUID | None = None,
) -> AuthChallenge:
    challenge = db.scalar(
        select(AuthChallenge).where(AuthChallenge.id == challenge_id).with_for_update()
    )
    now = utcnow()
    if (
        not challenge
        or challenge.purpose != purpose
        or challenge.installation_id != installation_id
        or challenge.session_id != session_id
        or challenge.consumed_at is not None
        or challenge.expires_at <= now
        or not hmac.compare_digest(challenge.nonce_hash, secret_hash(nonce))
    ):
        raise MobileAuthError("invalid_challenge")
    challenge.consumed_at = now
    return challenge


def verify_device_signature(public_key: str, signature: str, message: bytes) -> None:
    try:
        encoded_key = _decode_base64(public_key)
        encoded_signature = _decode_base64(signature)
        key = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), encoded_key)
        key.verify(encoded_signature, message, ec.ECDSA(hashes.SHA256()))
    except (ValueError, InvalidSignature):
        raise MobileAuthError("invalid_device_signature")


def require_device(db: Session, installation_id: str) -> MobileDevice:
    device = db.scalar(
        select(MobileDevice).where(MobileDevice.installation_id == installation_id)
    )
    if not device or device.disabled_at is not None:
        raise MobileAuthError("device_not_registered")
    return device


def create_mobile_session(
    db: Session,
    *,
    user: User,
    device: MobileDevice,
    login_provider: str,
    last_ip: str | None,
    user_agent: str | None,
) -> MobileTokenOut:
    now = utcnow()
    absolute_expires_at = now + timedelta(days=settings.mobile_session_absolute_days)
    idle_expires_at = min(
        now + timedelta(days=settings.mobile_session_idle_days), absolute_expires_at
    )
    db.execute(
        update(MobileSession)
        .where(
            MobileSession.user_id == user.id,
            MobileSession.device_id == device.id,
            MobileSession.revoked_at.is_(None),
        )
        .values(revoked_at=now, revoke_reason="new_login")
    )
    mobile_session = MobileSession(
        id=uuid.uuid4(),
        user_id=user.id,
        device_id=device.id,
        login_provider=login_provider,
        refresh_token_hash="pending",
        token_family_id=uuid.uuid4(),
        refresh_generation=0,
        last_used_at=now,
        idle_expires_at=idle_expires_at,
        absolute_expires_at=absolute_expires_at,
        last_ip=last_ip,
        last_user_agent=user_agent,
    )
    refresh_token = derive_refresh_token(mobile_session.id, 0)
    mobile_session.refresh_token_hash = secret_hash(refresh_token)
    device.last_seen_at = now
    db.add(mobile_session)
    db.commit()
    return token_response(mobile_session, refresh_token)


def refresh_mobile_session(
    db: Session,
    *,
    session_id: uuid.UUID,
    installation_id: str,
    refresh_token: str,
    request_id: str,
    challenge_id: uuid.UUID,
    nonce: str,
    signature: str,
    last_ip: str | None,
    user_agent: str | None,
) -> MobileTokenOut:
    mobile_session = db.scalar(
        select(MobileSession)
        .where(MobileSession.id == session_id)
        .with_for_update()
    )
    now = utcnow()
    if not mobile_session or mobile_session.revoked_at is not None:
        raise MobileAuthError("invalid_refresh_session")
    if (
        mobile_session.idle_expires_at <= now
        or mobile_session.absolute_expires_at <= now
    ):
        mobile_session.revoked_at = now
        mobile_session.revoke_reason = "expired"
        db.commit()
        raise MobileAuthError("refresh_session_expired")
    device = mobile_session.device
    user = db.get(User, mobile_session.user_id)
    if (
        not user
        or user.status != "active"
        or device.disabled_at is not None
        or device.installation_id != installation_id
    ):
        mobile_session.revoked_at = now
        mobile_session.revoke_reason = "account_or_device_disabled"
        db.commit()
        raise MobileAuthError("invalid_refresh_session")

    verify_challenge(
        db,
        challenge_id=challenge_id,
        nonce=nonce,
        purpose="refresh",
        installation_id=installation_id,
        session_id=session_id,
    )
    verify_device_signature(
        device.public_key,
        signature,
        refresh_message(
            challenge_id,
            nonce,
            installation_id,
            session_id,
            request_id,
            refresh_token,
        ),
    )

    presented_hash = secret_hash(refresh_token)
    if hmac.compare_digest(presented_hash, mobile_session.refresh_token_hash):
        mobile_session.previous_refresh_token_hash = mobile_session.refresh_token_hash
        mobile_session.refresh_generation += 1
        rotated_token = derive_refresh_token(
            mobile_session.id, mobile_session.refresh_generation
        )
        mobile_session.refresh_token_hash = secret_hash(rotated_token)
        mobile_session.last_rotation_request_id = request_id
        mobile_session.last_rotated_at = now
    elif _is_idempotent_refresh_retry(mobile_session, presented_hash, request_id, now):
        rotated_token = derive_refresh_token(
            mobile_session.id, mobile_session.refresh_generation
        )
    else:
        mobile_session.revoked_at = now
        mobile_session.revoke_reason = "refresh_replay"
        db.commit()
        raise MobileAuthError("refresh_token_reused")

    mobile_session.last_used_at = now
    mobile_session.last_ip = last_ip
    mobile_session.last_user_agent = user_agent
    mobile_session.idle_expires_at = min(
        now + timedelta(days=settings.mobile_session_idle_days),
        mobile_session.absolute_expires_at,
    )
    device.last_seen_at = now
    db.commit()
    return token_response(mobile_session, rotated_token)


def token_response(mobile_session: MobileSession, refresh_token: str) -> MobileTokenOut:
    access_token = create_access_token(
        str(mobile_session.user_id),
        audience=settings.mobile_jwt_audience,
        expires_minutes=settings.mobile_access_token_expires_minutes,
        session_id=str(mobile_session.id),
        device_id=str(mobile_session.device_id),
    )
    return MobileTokenOut(
        access_token=access_token,
        expires_in=settings.mobile_access_token_expires_minutes * 60,
        refresh_token=refresh_token,
        refresh_token_expires_at=mobile_session.idle_expires_at,
        session_id=mobile_session.id,
    )


def derive_refresh_token(session_id: uuid.UUID, generation: int) -> str:
    message = f"timia-mobile-refresh-token:{session_id}:{generation}".encode()
    digest = hmac.new(settings.jwt_secret.encode(), message, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


def _is_idempotent_refresh_retry(
    mobile_session: MobileSession,
    presented_hash: str,
    request_id: str,
    now,
) -> bool:
    if (
        not mobile_session.previous_refresh_token_hash
        or not hmac.compare_digest(
            presented_hash, mobile_session.previous_refresh_token_hash
        )
        or mobile_session.last_rotation_request_id != request_id
        or mobile_session.last_rotated_at is None
    ):
        return False
    return (
        now - mobile_session.last_rotated_at
    ).total_seconds() <= settings.mobile_refresh_retry_grace_seconds


def _decode_base64(value: str) -> bytes:
    try:
        return base64.b64decode(value, validate=True)
    except (ValueError, TypeError):
        raise MobileAuthError("invalid_base64_payload", 422)
