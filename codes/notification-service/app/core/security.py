from datetime import UTC, datetime, timedelta

from jose import JWTError, jwt

from app.core.config import settings

ALGORITHM = "HS256"
PAT_PREFIX = "tm_pat_"


def create_access_token(
    subject: str,
    *,
    audience: str | None = None,
    expires_minutes: int = 30,
    session_id: str | None = None,
    device_id: str | None = None,
) -> str:
    now = datetime.now(UTC)
    exp = now + timedelta(minutes=expires_minutes)
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
