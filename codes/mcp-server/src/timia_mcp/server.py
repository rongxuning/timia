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
from timia_mcp.profiles import is_tool_enabled
from timia_mcp.tools.profile import whoami_impl

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
    finally:
        latency_ms = int((time.monotonic() - start) * 1000)
        await emit_audit(client, tool_name, ok, error_detail, latency_ms, {})


def build_mcp(settings: Settings, client: TimiaHttpClient) -> _MCPApp:
    mcp_app = _resolve_mcp_app()("timia")

    if is_tool_enabled(settings.tool_profile, "whoami"):

        @mcp_app.tool(
            name="whoami",
            description="Return the authenticated Timia user (id, email, display_name, system_role).",
        )
        async def whoami() -> str:
            return await _run_tool(client, "whoami", whoami_impl)

    return mcp_app


def main() -> None:
    settings = load_settings()
    client = TimiaHttpClient(settings)
    mcp = build_mcp(settings, client)
    mcp.run(transport="stdio")
