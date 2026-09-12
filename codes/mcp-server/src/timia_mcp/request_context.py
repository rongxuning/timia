from __future__ import annotations

from contextvars import ContextVar

from timia_mcp.http_client import TimiaHttpClient

request_client: ContextVar[TimiaHttpClient | None] = ContextVar("request_client", default=None)


def get_request_client() -> TimiaHttpClient:
    client = request_client.get()
    if client is None:
        raise RuntimeError("No request-scoped TimiaHttpClient")
    return client
