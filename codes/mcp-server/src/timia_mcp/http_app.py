from __future__ import annotations

import json
import sys
import time
from typing import Any

from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from starlette.types import ASGIApp, Receive, Scope, Send

from timia_mcp.config import Settings
from timia_mcp.http_client import TimiaHttpClient
from timia_mcp.request_context import get_request_client, request_client
from timia_mcp.server import build_mcp

try:
    from mcp.server.transport_security import TransportSecuritySettings
except ImportError:  # pragma: no cover
    TransportSecuritySettings = None  # type: ignore[misc, assignment]

PAT_PREFIX = "tm_pat_"


def _unauthorized(message: str) -> JSONResponse:
    return JSONResponse(
        {"error": "unauthorized", "message": message},
        status_code=401,
    )


def parse_bearer_pat(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.split(None, 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    token = parts[1].strip()
    if not token.startswith(PAT_PREFIX):
        return None
    return token


class BearerPatMiddleware:
    """Require Authorization: Bearer tm_pat_… on MCP paths; bind per-request client."""

    def __init__(self, app: ASGIApp, settings: Settings) -> None:
        self.app = app
        self.settings = settings
        path = settings.mcp_path.rstrip("/") or "/mcp"
        self._mcp_path = path
        self._public_paths = {"/health"}

    def _requires_auth(self, path: str) -> bool:
        if path in self._public_paths:
            return False
        if path == self._mcp_path or path.startswith(self._mcp_path + "/"):
            return True
        if path == "/__auth_probe":
            return True
        return False

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "lifespan":
            await self.app(scope, receive, send)
            return
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        start = time.monotonic()
        status_holder: dict[str, int] = {"status": 0}

        async def send_wrapper(message: dict[str, Any]) -> None:
            if message["type"] == "http.response.start":
                status_holder["status"] = int(message.get("status", 0))
            await send(message)

        if not self._requires_auth(path):
            await self.app(scope, receive, send_wrapper)
            self._log_access(scope, status_holder["status"], start)
            return

        headers = {
            k.decode("latin-1").lower(): v.decode("latin-1")
            for k, v in scope.get("headers", [])
        }
        token = parse_bearer_pat(headers.get("authorization"))
        if token is None:
            response = _unauthorized("Authorization Bearer tm_pat_… required")
            await response(scope, receive, send)
            self._log_access(scope, 401, start)
            return

        client = TimiaHttpClient(self.settings, pat=token)
        ctx_token = request_client.set(client)
        try:
            await self.app(scope, receive, send_wrapper)
        finally:
            request_client.reset(ctx_token)
            await client.aclose()
            self._log_access(scope, status_holder["status"], start)

    def _log_access(self, scope: Scope, status: int, start: float) -> None:
        latency_ms = int((time.monotonic() - start) * 1000)
        payload = {
            "event": "mcp_http_access",
            "method": scope.get("method"),
            "path": scope.get("path"),
            "status": status,
            "latency_ms": latency_ms,
        }
        print(json.dumps(payload, ensure_ascii=False), file=sys.stderr)


async def _health(_request: Request) -> Response:
    return JSONResponse({"ok": True, "transport": "http"})


async def _auth_probe(_request: Request) -> Response:
    client = get_request_client()
    auth = client._client.headers.get("Authorization", "")
    # Never return the full PAT — only confirm binding.
    return JSONResponse(
        {
            "ok": True,
            "authorization_scheme": auth.split(" ", 1)[0] if auth else None,
            "pat_prefix": PAT_PREFIX if auth.startswith(f"Bearer {PAT_PREFIX}") else None,
        }
    )


def _default_allowed_hosts(settings: Settings) -> list[str]:
    hosts = [
        "localhost",
        "localhost:8100",
        "127.0.0.1",
        "127.0.0.1:8100",
        "0.0.0.0",
        "test",
        "testserver",
        "timia.online",
        "timia.online:443",
    ]
    if settings.host and settings.host not in ("0.0.0.0",):
        hosts.append(settings.host)
    return hosts


def create_http_app(settings: Settings, *, include_auth_probe: bool = False) -> ASGIApp:
    """Build Streamable HTTP ASGI app with per-request PAT middleware.

    Uses MCP SDK ``MCPServer.streamable_http_app`` (mcp 2.x; FastMCP renamed).
    """
    mcp = build_mcp(settings, client=None)

    @mcp.custom_route("/health", methods=["GET"])
    async def health(request: Request) -> Response:
        return await _health(request)

    if include_auth_probe:

        @mcp.custom_route("/__auth_probe", methods=["GET"])
        async def auth_probe(request: Request) -> Response:
            return await _auth_probe(request)

    transport_security = None
    if TransportSecuritySettings is not None:
        transport_security = TransportSecuritySettings(
            enable_dns_rebinding_protection=True,
            allowed_hosts=_default_allowed_hosts(settings),
        )

    inner: Starlette = mcp.streamable_http_app(
        streamable_http_path=settings.mcp_path,
        stateless_http=True,
        transport_security=transport_security,
        host=settings.host,
    )
    return BearerPatMiddleware(inner, settings)


def run_http_server(settings: Settings) -> None:
    import uvicorn

    app = create_http_app(settings)
    uvicorn.run(app, host=settings.host, port=settings.port, log_level="info")
