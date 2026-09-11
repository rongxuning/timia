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
from timia_mcp.tools.schedule import (
    get_schedule_dashboard_impl,
    get_schedule_impl,
    list_overdue_impl,
    list_priority_impl,
    list_undated_impl,
)
from timia_mcp.tools.workspace import (
    get_activity_impl,
    get_project_dashboard_impl,
    get_workspace_dashboard_impl,
    list_projects_impl,
    list_workspaces_impl,
)

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


def build_mcp(settings: Settings, client: TimiaHttpClient) -> _MCPApp:
    mcp_app = _resolve_mcp_app()("timia")

    if is_tool_enabled(settings.tool_profile, "whoami"):

        @mcp_app.tool(
            name="whoami",
            description="Return the authenticated Timia user (id, email, display_name, system_role).",
        )
        async def whoami() -> str:
            return await _run_tool(client, "whoami", whoami_impl)

    if is_tool_enabled(settings.tool_profile, "list_workspaces"):

        @mcp_app.tool(
            name="list_workspaces",
            description="List workspaces the user belongs to (id, name, role, is_favorite).",
        )
        async def list_workspaces(favorite_only: bool = False) -> str:
            return await _run_tool(
                client, "list_workspaces", list_workspaces_impl, favorite_only=favorite_only
            )

    if is_tool_enabled(settings.tool_profile, "list_projects"):

        @mcp_app.tool(
            name="list_projects",
            description="List projects in a workspace (id, name, archived).",
        )
        async def list_projects(workspace_id: str) -> str:
            return await _run_tool(
                client, "list_projects", list_projects_impl, workspace_id=workspace_id
            )

    if is_tool_enabled(settings.tool_profile, "get_workspace_dashboard"):

        @mcp_app.tool(
            name="get_workspace_dashboard",
            description="Return the workspace home dashboard (stats, projects, members).",
        )
        async def get_workspace_dashboard(workspace_id: str) -> str:
            return await _run_tool(
                client,
                "get_workspace_dashboard",
                get_workspace_dashboard_impl,
                workspace_id=workspace_id,
            )

    if is_tool_enabled(settings.tool_profile, "get_project_dashboard"):

        @mcp_app.tool(
            name="get_project_dashboard",
            description="Return the project home dashboard (stats, members, metadata).",
        )
        async def get_project_dashboard(workspace_id: str, project_id: str) -> str:
            return await _run_tool(
                client,
                "get_project_dashboard",
                get_project_dashboard_impl,
                workspace_id=workspace_id,
                project_id=project_id,
            )

    if is_tool_enabled(settings.tool_profile, "get_activity"):

        @mcp_app.tool(
            name="get_activity",
            description="Return recent workspace activity timeline entries.",
        )
        async def get_activity(workspace_id: str, limit: int = 20) -> str:
            return await _run_tool(
                client,
                "get_activity",
                get_activity_impl,
                workspace_id=workspace_id,
                limit=limit,
            )

    if is_tool_enabled(settings.tool_profile, "get_schedule"):

        @mcp_app.tool(
            name="get_schedule",
            description=(
                "Return trimmed calendar task items for the given view "
                "(day, week, month; default week)."
            ),
        )
        async def get_schedule(
            view: str = "week",
            anchor: str | None = None,
            scope: str = "me",
            workspace_id: str | None = None,
            project_id: str | None = None,
            timezone: str | None = None,
        ) -> str:
            return await _run_tool(
                client,
                "get_schedule",
                get_schedule_impl,
                view=view,
                anchor=anchor,
                scope=scope,
                workspace_id=workspace_id,
                project_id=project_id,
                timezone=timezone or settings.default_timezone,
            )

    if is_tool_enabled(settings.tool_profile, "get_schedule_dashboard"):

        @mcp_app.tool(
            name="get_schedule_dashboard",
            description="Return personal schedule dashboard counts and summary fields.",
        )
        async def get_schedule_dashboard() -> str:
            return await _run_tool(
                client, "get_schedule_dashboard", get_schedule_dashboard_impl
            )

    if is_tool_enabled(settings.tool_profile, "list_overdue"):

        @mcp_app.tool(
            name="list_overdue",
            description="List overdue schedule items (trimmed summaries).",
        )
        async def list_overdue(
            scope: str = "me",
            workspace_id: str | None = None,
            project_id: str | None = None,
            timezone: str | None = None,
        ) -> str:
            return await _run_tool(
                client,
                "list_overdue",
                list_overdue_impl,
                scope=scope,
                workspace_id=workspace_id,
                project_id=project_id,
                timezone=timezone or settings.default_timezone,
            )

    if is_tool_enabled(settings.tool_profile, "list_undated"):

        @mcp_app.tool(
            name="list_undated",
            description="List schedule items without start/end dates.",
        )
        async def list_undated(
            scope: str = "me",
            workspace_id: str | None = None,
            project_id: str | None = None,
        ) -> str:
            return await _run_tool(
                client,
                "list_undated",
                list_undated_impl,
                scope=scope,
                workspace_id=workspace_id,
                project_id=project_id,
            )

    if is_tool_enabled(settings.tool_profile, "list_priority"):

        @mcp_app.tool(
            name="list_priority",
            description="List schedule items grouped by priority quadrants (flattened summaries).",
        )
        async def list_priority(
            scope: str = "me",
            workspace_id: str | None = None,
            project_id: str | None = None,
        ) -> str:
            return await _run_tool(
                client,
                "list_priority",
                list_priority_impl,
                scope=scope,
                workspace_id=workspace_id,
                project_id=project_id,
            )

    return mcp_app


def main() -> None:
    settings = load_settings()
    client = TimiaHttpClient(settings)
    mcp = build_mcp(settings, client)
    mcp.run(transport="stdio")
