from __future__ import annotations

import json
import sys
import time
from collections.abc import Awaitable, Callable
from typing import Any

from timia_mcp.audit import emit_audit
from timia_mcp.config import Settings, load_settings
from timia_mcp.errors import ReadonlyError, json_result, tool_error_from_http
from timia_mcp.http_client import TimiaHttpClient, TimiaHttpError
from timia_mcp.request_context import request_client
from timia_mcp.tools import ToolContext, register_all

try:
    from mcp.server.fastmcp import FastMCP as _MCPApp
except ImportError:
    from mcp.server.mcpserver import MCPServer as _MCPApp


ToolImpl = Callable[..., Awaitable[Any]]


def _resolve_mcp_app() -> type[_MCPApp]:
    return _MCPApp


async def _run_tool(
    client: TimiaHttpClient,
    tool_name: str,
    impl: ToolImpl,
    *args: Any,
    **kwargs: Any,
) -> str:
    start = time.monotonic()
    ok = True
    error_detail: str | None = None
    try:
        result = await impl(client, *args, **kwargs)
        return json_result(result)
    except TimiaHttpError as exc:
        ok = False
        err = tool_error_from_http(exc.status, exc.detail)
        error_detail = str(err.get("error"))
        print(json.dumps(err, ensure_ascii=False), file=sys.stderr)
        return json_result(err)
    except ReadonlyError as exc:
        ok = False
        err = exc.to_dict()
        error_detail = str(err.get("error"))
        print(json.dumps(err, ensure_ascii=False), file=sys.stderr)
        return json_result(err)
    except Exception:
        ok = False
        raise
    finally:
        latency_ms = int((time.monotonic() - start) * 1000)
        await emit_audit(client, tool_name, ok, error_detail, latency_ms, {})


def build_mcp(settings: Settings, client: TimiaHttpClient | None) -> _MCPApp:
    mcp_app = _resolve_mcp_app()("timia")

    async def run_tool(tool_name: str, impl: ToolImpl, *args: Any, **kwargs: Any) -> str:
        active = request_client.get() or client
        if active is None:
            raise RuntimeError("No TimiaHttpClient available for tool call")
        return await _run_tool(active, tool_name, impl, *args, **kwargs)

    # Placeholder for HTTP mode (tools resolve via request ContextVar).
    ctx_client = client if client is not None else TimiaHttpClient.__new__(TimiaHttpClient)
    ctx = ToolContext(settings=settings, client=ctx_client, run_tool=run_tool)
    register_all(mcp_app, ctx)
    return mcp_app


def main() -> None:
    settings = load_settings()
    if settings.transport == "http":
        from timia_mcp.http_app import run_http_server

        run_http_server(settings)
        return

    client = TimiaHttpClient(settings)
    mcp = build_mcp(settings, client)
    mcp.run(transport="stdio")
