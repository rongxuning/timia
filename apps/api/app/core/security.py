from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt
from passlib.context import CryptContext

from app.core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
ALGORITHM = "HS256"

# 重命名前签发的 access token（iss/aud）；解码时与当前 settings 一并尝试。
_LEGACY_JWT_ISSUER = "nomia"
_LEGACY_JWT_AUDIENCE = "nomia-web"


def hash_password(p: str) -> str:
    return pwd_context.hash(p)


def verify_password(p: str, h: str) -> bool:
    return pwd_context.verify(p, h)


def create_access_token(subject: str) -> str:
    now = datetime.now(timezone.utc)
    exp = now + timedelta(minutes=settings.access_token_expires_minutes)
    payload = {
        "sub": subject,
        "iss": settings.jwt_issuer,
        "aud": settings.jwt_audience,
        "iat": int(now.timestamp()),
        "exp": int(exp.timestamp()),
    }
    return jwt.encode(payload, settings.jwt_secret, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict:
    candidates = [
        (settings.jwt_issuer, settings.jwt_audience),
        (_LEGACY_JWT_ISSUER, _LEGACY_JWT_AUDIENCE),
    ]
    seen: set[tuple[str, str]] = set()
    last_err: JWTError | None = None
    for issuer, audience in candidates:
        key = (issuer, audience)
        if key in seen:
            continue
        seen.add(key)
        try:
            return jwt.decode(
                token,
                settings.jwt_secret,
                algorithms=[ALGORITHM],
                audience=audience,
                issuer=issuer,
            )
        except JWTError as e:
            last_err = e
            continue
    raise ValueError("invalid_token") from last_err

