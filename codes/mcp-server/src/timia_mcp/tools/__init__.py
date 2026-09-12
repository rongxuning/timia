from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from timia_mcp.config import Settings
from timia_mcp.http_client import TimiaHttpClient
from timia_mcp.profiles import is_tool_enabled
from timia_mcp.tools.comments import add_comment_impl, list_comments_impl
from timia_mcp.tools.items import (
    complete_item_impl,
    create_item_impl,
    get_item_impl,
    list_items_impl,
    parse_natural_language_impl,
    update_item_impl,
)
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

RunTool = Callable[..., Awaitable[str]]


@dataclass(frozen=True)
class ToolContext:
    settings: Settings
    client: TimiaHttpClient
    run_tool: RunTool


def registered_tool_names(mcp: _MCPApp) -> set[str]:
    return set(mcp._tool_manager._tools.keys())


def register_all(mcp: _MCPApp, ctx: ToolContext) -> None:
    settings = ctx.settings
    run = ctx.run_tool

    if is_tool_enabled(settings.tool_profile, "whoami"):

        @mcp.tool(
            name="whoami",
            description="Return the authenticated Timia user (id, email, display_name, system_role).",
        )
        async def whoami() -> str:
            return await run("whoami", whoami_impl)

    if is_tool_enabled(settings.tool_profile, "list_workspaces"):

        @mcp.tool(
            name="list_workspaces",
            description="List workspaces the user belongs to (id, name, role, is_favorite).",
        )
        async def list_workspaces(favorite_only: bool = False) -> str:
            return await run(
                "list_workspaces", list_workspaces_impl, favorite_only=favorite_only
            )

    if is_tool_enabled(settings.tool_profile, "list_projects"):

        @mcp.tool(
            name="list_projects",
            description="List projects in a workspace (id, name, archived).",
        )
        async def list_projects(workspace_id: str) -> str:
            return await run(
                "list_projects", list_projects_impl, workspace_id=workspace_id
            )

    if is_tool_enabled(settings.tool_profile, "get_workspace_dashboard"):

        @mcp.tool(
            name="get_workspace_dashboard",
            description="Return the workspace home dashboard (stats, projects, members).",
        )
        async def get_workspace_dashboard(workspace_id: str) -> str:
            return await run(
                "get_workspace_dashboard",
                get_workspace_dashboard_impl,
                workspace_id=workspace_id,
            )

    if is_tool_enabled(settings.tool_profile, "get_project_dashboard"):

        @mcp.tool(
            name="get_project_dashboard",
            description="Return the project home dashboard (stats, members, metadata).",
        )
        async def get_project_dashboard(workspace_id: str, project_id: str) -> str:
            return await run(
                "get_project_dashboard",
                get_project_dashboard_impl,
                workspace_id=workspace_id,
                project_id=project_id,
            )

    if is_tool_enabled(settings.tool_profile, "get_activity"):

        @mcp.tool(
            name="get_activity",
            description="Return recent workspace activity timeline entries.",
        )
        async def get_activity(workspace_id: str, limit: int = 20) -> str:
            return await run(
                "get_activity",
                get_activity_impl,
                workspace_id=workspace_id,
                limit=limit,
            )

    if is_tool_enabled(settings.tool_profile, "get_schedule"):

        @mcp.tool(
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
            return await run(
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

        @mcp.tool(
            name="get_schedule_dashboard",
            description="Return personal schedule dashboard counts and summary fields.",
        )
        async def get_schedule_dashboard() -> str:
            return await run("get_schedule_dashboard", get_schedule_dashboard_impl)

    if is_tool_enabled(settings.tool_profile, "list_overdue"):

        @mcp.tool(
            name="list_overdue",
            description="List overdue schedule items (trimmed summaries).",
        )
        async def list_overdue(
            scope: str = "me",
            workspace_id: str | None = None,
            project_id: str | None = None,
            timezone: str | None = None,
        ) -> str:
            return await run(
                "list_overdue",
                list_overdue_impl,
                scope=scope,
                workspace_id=workspace_id,
                project_id=project_id,
                timezone=timezone or settings.default_timezone,
            )

    if is_tool_enabled(settings.tool_profile, "list_undated"):

        @mcp.tool(
            name="list_undated",
            description="List schedule items without start/end dates.",
        )
        async def list_undated(
            scope: str = "me",
            workspace_id: str | None = None,
            project_id: str | None = None,
        ) -> str:
            return await run(
                "list_undated",
                list_undated_impl,
                scope=scope,
                workspace_id=workspace_id,
                project_id=project_id,
            )

    if is_tool_enabled(settings.tool_profile, "list_priority"):

        @mcp.tool(
            name="list_priority",
            description="List schedule items grouped by priority quadrants (flattened summaries).",
        )
        async def list_priority(
            scope: str = "me",
            workspace_id: str | None = None,
            project_id: str | None = None,
        ) -> str:
            return await run(
                "list_priority",
                list_priority_impl,
                scope=scope,
                workspace_id=workspace_id,
                project_id=project_id,
            )

    if is_tool_enabled(settings.tool_profile, "get_item"):

        @mcp.tool(
            name="get_item",
            description="Return a single item summary (id, version, title, start_at, end_at, status).",
        )
        async def get_item(workspace_id: str, project_id: str, item_id: str) -> str:
            return await run(
                "get_item",
                get_item_impl,
                workspace_id=workspace_id,
                project_id=project_id,
                item_id=item_id,
            )

    if is_tool_enabled(settings.tool_profile, "list_items"):

        @mcp.tool(
            name="list_items",
            description="List items in a project with optional status filter and limit.",
        )
        async def list_items(
            workspace_id: str,
            project_id: str,
            status: str | None = None,
            limit: int | None = None,
        ) -> str:
            return await run(
                "list_items",
                list_items_impl,
                workspace_id=workspace_id,
                project_id=project_id,
                status=status,
                limit=limit,
            )

    if is_tool_enabled(settings.tool_profile, "create_item"):

        @mcp.tool(
            name="create_item",
            description="Create a schedule item in a project (requires schedule:write).",
        )
        async def create_item(
            workspace_id: str,
            project_id: str,
            title: str,
            body: str | None = None,
            color: str | None = None,
            status: str | None = None,
            priority: str | None = None,
            start_at: str | None = None,
            end_at: str | None = None,
            location: str | None = None,
            details: str | None = None,
            assignee_user_id: str | None = None,
            participant_user_ids: list[str] | None = None,
            repeat: str | None = None,
        ) -> str:
            return await run(
                "create_item",
                create_item_impl,
                workspace_id=workspace_id,
                project_id=project_id,
                title=title,
                body=body,
                color=color,
                status=status,
                priority=priority,
                start_at=start_at,
                end_at=end_at,
                location=location,
                details=details,
                assignee_user_id=assignee_user_id,
                participant_user_ids=participant_user_ids,
                repeat=repeat,
            )

    if is_tool_enabled(settings.tool_profile, "update_item"):

        @mcp.tool(
            name="update_item",
            description="Update an item (version required; 409 returns version_conflict).",
        )
        async def update_item(
            workspace_id: str,
            project_id: str,
            item_id: str,
            version: int,
            title: str | None = None,
            body: str | None = None,
            color: str | None = None,
            status: str | None = None,
            priority: str | None = None,
            start_at: str | None = None,
            end_at: str | None = None,
            completed_at: str | None = None,
            location: str | None = None,
            details: str | None = None,
            assignee_user_id: str | None = None,
            participant_user_ids: list[str] | None = None,
            repeat: str | None = None,
        ) -> str:
            return await run(
                "update_item",
                update_item_impl,
                workspace_id=workspace_id,
                project_id=project_id,
                item_id=item_id,
                version=version,
                title=title,
                body=body,
                color=color,
                status=status,
                priority=priority,
                start_at=start_at,
                end_at=end_at,
                completed_at=completed_at,
                location=location,
                details=details,
                assignee_user_id=assignee_user_id,
                participant_user_ids=participant_user_ids,
                repeat=repeat,
            )

    if is_tool_enabled(settings.tool_profile, "complete_item"):

        @mcp.tool(
            name="complete_item",
            description="Mark an item as done (sets status=done and completed_at).",
        )
        async def complete_item(
            workspace_id: str,
            project_id: str,
            item_id: str,
            version: int,
        ) -> str:
            return await run(
                "complete_item",
                complete_item_impl,
                workspace_id=workspace_id,
                project_id=project_id,
                item_id=item_id,
                version=version,
            )

    if is_tool_enabled(settings.tool_profile, "parse_natural_language"):

        @mcp.tool(
            name="parse_natural_language",
            description=(
                "Parse natural-language task text into a draft (does not persist; "
                "use create_item to save)."
            ),
        )
        async def parse_natural_language(
            text: str,
            reference_time: str,
            selected_date: str,
            timezone: str | None = None,
        ) -> str:
            return await run(
                "parse_natural_language",
                parse_natural_language_impl,
                text=text,
                reference_time=reference_time,
                selected_date=selected_date,
                timezone=timezone or settings.default_timezone,
            )

    if is_tool_enabled(settings.tool_profile, "list_comments"):

        @mcp.tool(
            name="list_comments",
            description="List comments on an item (id, author, body, created_at).",
        )
        async def list_comments(
            workspace_id: str,
            project_id: str,
            item_id: str,
        ) -> str:
            return await run(
                "list_comments",
                list_comments_impl,
                workspace_id=workspace_id,
                project_id=project_id,
                item_id=item_id,
            )

    if is_tool_enabled(settings.tool_profile, "add_comment"):

        @mcp.tool(
            name="add_comment",
            description="Add a comment to an item (requires workspace:write).",
        )
        async def add_comment(
            workspace_id: str,
            project_id: str,
            item_id: str,
            body: str,
        ) -> str:
            return await run(
                "add_comment",
                add_comment_impl,
                workspace_id=workspace_id,
                project_id=project_id,
                item_id=item_id,
                body=body,
            )
