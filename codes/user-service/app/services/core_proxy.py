"""Forward /auth/* that this process does not own yet to core-service."""

from __future__ import annotations

import logging

import httpx
from fastapi import HTTPException, Request
from starlette.responses import Response

from app.core.config import settings

logger = logging.getLogger(__name__)

_transport: httpx.AsyncBaseTransport | None = None

_FORWARD_REQUEST = {
    "authorization",
    "cookie",
    "content-type",
    "accept",
    "user-agent",
    "x-forwarded-for",
    "x-forwarded-proto",
    "x-real-ip",
}
_FORWARD_RESPONSE = {"content-type", "location", "cache-control", "www-authenticate"}


def set_transport(transport: httpx.AsyncBaseTransport | None) -> None:
    """Test hook. Production leaves this unset and uses the real network."""
    global _transport
    _transport = transport


async def forward_auth(request: Request, path: str) -> Response:
    base = settings.core_service_base.rstrip("/")
    if not base:
        raise HTTPException(status_code=502, detail="auth_upstream_unavailable")
    url = f"{base}/auth/{path}"
    if request.url.query:
        url = f"{url}?{request.url.query}"
    headers = {
        key: value
        for key, value in request.headers.items()
        if key.lower() in _FORWARD_REQUEST
    }
    try:
        async with httpx.AsyncClient(
            transport=_transport,
            follow_redirects=False,
            timeout=30,
        ) as client:
            upstream = await client.request(
                request.method,
                url,
                content=await request.body(),
                headers=headers,
            )
    except httpx.HTTPError as exc:
        logger.warning("auth proxy failed: %s", type(exc).__name__)
        raise HTTPException(status_code=502, detail="auth_upstream_unavailable") from exc

    response = Response(content=upstream.content, status_code=upstream.status_code)
    if "content-type" in response.headers:
        del response.headers["content-type"]
    for key in _FORWARD_RESPONSE:
        value = upstream.headers.get(key)
        if value:
            response.headers[key] = value
    for cookie in upstream.headers.get_list("set-cookie"):
        response.headers.append("set-cookie", cookie)
    return response
