from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
ALGORITHM = "HS256"


def hash_password(p: str) -> str:
    return pwd_context.hash(p)


def verify_password(p: str, h: str) -> bool:
    return pwd_context.verify(p, h)


def create_access_token(
    subject: str,
    *,
    audience: str | None = None,
    expires_minutes: int | None = None,
    session_id: str | None = None,
    device_id: str | None = None,
) -> str:
    now = datetime.now(timezone.utc)
    exp = now + timedelta(
        minutes=expires_minutes or settings.access_token_expires_minutes
    )
    payload = {
        "sub": subject,
        "iss": settings.jwt_issuer,
        "aud": audience or settings.jwt_audience,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    if session_id:
        payload["sid"] = session_id
    if device_id:
        payload["did"] = device_id
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    try:
        payload = jwt.decode(
            token,
            settings.jwt_secret,
            algorithms=[ALGORITHM],
            issuer=settings.jwt_issuer,
            options={"verify_aud": False},
        )
        audience = payload.get("aud")
        if audience not in {settings.jwt_audience, settings.mobile_jwt_audience}:
            raise ValueError("invalid_audience")
        return payload
    except JWTError as e:
        raise ValueError("invalid_token") from e
