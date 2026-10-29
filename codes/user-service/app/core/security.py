import hmac

from app.core.config import settings


def token_matches(presented: str | None) -> bool:
    expected = settings.user_internal_token
    if not presented or not expected:
        return False
    return hmac.compare_digest(presented.encode(), expected.encode())
