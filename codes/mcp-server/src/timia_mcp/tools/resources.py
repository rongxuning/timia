from __future__ import annotations

import json
from typing import Any

from timia_mcp.request_context import request_client
from timia_mcp.tools.items import get_item_impl
from timia_mcp.tools.profile import whoami_impl
from timia_mcp.tools.schedule import get_schedule_impl
from timia_mcp.tools.workspace import get_workspace_dashboard_impl

try:
    from mcp.server.fastmcp import FastMCP as _MCPApp
except ImportError:
    from mcp.server.mcpserver import MCPServer as _MCPApp


def _active_client(ctx: Any):
    return request_client.get() or ctx.client


def register_resources(mcp: _MCPApp, ctx: Any) -> None:
    """Read-only URIs. Registered for p1 and full profiles."""

    @mcp.resource(
        "timia://me",
        name="me",
        description="Authenticated Timia user snapshot.",
        mime_type="application/json",
    )
    async def me_resource() -> str:
        data = await whoami_impl(_active_client(ctx))
        return json.dumps(data, ensure_ascii=False)

    @mcp.resource(
        "timia://schedule/today",
        name="schedule_today",
        description="Today's schedule items for the authenticated user.",
        mime_type="application/json",
    )
    async def schedule_today_resource() -> str:
        data = await get_schedule_impl(
            _active_client(ctx),
            view="day",
            timezone=ctx.settings.default_timezone,
        )
        return json.dumps(data, ensure_ascii=False)

    @mcp.resource(
        "timia://workspace/{workspace_id}",
        name="workspace",
        description="Workspace dashboard summary.",
        mime_type="application/json",
    )
    async def workspace_resource(workspace_id: str) -> str:
        data = await get_workspace_dashboard_impl(_active_client(ctx), workspace_id)
        return json.dumps(data, ensure_ascii=False)

    @mcp.resource(
        "timia://item/{workspace_id}/{project_id}/{item_id}",
        name="item",
        description="Item summary.",
        mime_type="application/json",
    )
    async def item_resource(workspace_id: str, project_id: str, item_id: str) -> str:
        data = await get_item_impl(_active_client(ctx), workspace_id, project_id, item_id)
        return json.dumps(data, ensure_ascii=False)
