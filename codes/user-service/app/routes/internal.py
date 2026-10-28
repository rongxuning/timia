from fastapi import APIRouter, Header, HTTPException, status

from app.core.security import token_matches

router = APIRouter(prefix="/internal", tags=["internal"])


@router.get("/health")
def internal_health(
    x_internal_token: str | None = Header(default=None, alias="X-Internal-Token"),
):
    if not token_matches(x_internal_token):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_token")
    return {"ok": True}
