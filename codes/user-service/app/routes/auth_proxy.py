from fastapi import APIRouter, Request

from app.services.core_proxy import forward_auth

router = APIRouter(tags=["auth-proxy"])

_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"]


@router.api_route("/auth/{path:path}", methods=_METHODS, include_in_schema=False)
async def proxy_auth(path: str, request: Request):
    """Strangler front door. WeChat and Google website login are local; the rest stays in core."""
    return await forward_auth(request, path)
