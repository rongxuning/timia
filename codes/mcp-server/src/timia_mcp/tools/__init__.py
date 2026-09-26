from __future__ import annotations

from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from timia_mcp.config import Settings
from timia_mcp.http_client import TimiaHttpClient
from timia_mcp.profiles import is_tool_enabled
from timia_mcp.tools.comments import add_comment_impl, list_comments_impl
from timia_mcp.tools.health import (
    get_health_metric_impl,
    get_health_summary_impl,
    get_workout_impl,
    list_workouts_impl,
)
from timia_mcp.tools.items import (
    complete_item_impl,
    create_item_impl,
    get_item_impl,
    list_items_impl,
    parse_natural_language_impl,
    update_item_impl,
)
from timia_mcp.tools.notes import (
    ai_parse_sticky_note_impl,
    convert_sticky_note_impl,
    create_sticky_note_impl,
    list_sticky_notes_impl,
)
from timia_mcp.tools.plans import (
    get_plan_impl,
    import_plan_period_impl,
    list_plan_notifications_impl,
    search_plans_impl,
    subscribe_plan_impl,
)
from timia_mcp.tools.profile import whoami_impl
from timia_mcp.tools.prompts import register_prompts
from timia_mcp.tools.resources import register_resources
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

    if is_tool_enabled(settings.tool_profile, "list_sticky_notes"):

        @mcp.tool(
            name="list_sticky_notes",
            description="List the user's sticky notes (id, title, content, recorded_at).",
        )
        async def list_sticky_notes(
            limit: int = 20,
            cursor: str | None = None,
            include_archived: bool = False,
        ) -> str:
            return await run(
                "list_sticky_notes",
                list_sticky_notes_impl,
                limit=limit,
                cursor=cursor,
                include_archived=include_archived,
            )

    if is_tool_enabled(settings.tool_profile, "create_sticky_note"):

        @mcp.tool(
            name="create_sticky_note",
            description="Create a sticky note for the user (requires notes:write).",
        )
        async def create_sticky_note(
            content: str,
            title: str | None = None,
            timezone: str | None = None,
            auto_parse: bool = False,
        ) -> str:
            return await run(
                "create_sticky_note",
                create_sticky_note_impl,
                content=content,
                title=title,
                timezone=timezone or settings.default_timezone,
                auto_parse=auto_parse,
            )

    if is_tool_enabled(settings.tool_profile, "ai_parse_sticky_note"):

        @mcp.tool(
            name="ai_parse_sticky_note",
            description=(
                "Parse a sticky note into a task draft (requires notes:write). "
                "Does not create a schedule item."
            ),
        )
        async def ai_parse_sticky_note(note_id: str) -> str:
            return await run(
                "ai_parse_sticky_note", ai_parse_sticky_note_impl, note_id=note_id
            )

    if is_tool_enabled(settings.tool_profile, "convert_sticky_note"):

        @mcp.tool(
            name="convert_sticky_note",
            description=(
                "Create a real schedule item from a sticky-note parse. "
                "Requires notes:write plus workspace_id and project_id. "
                "Pass item_id only when linking an existing item."
            ),
        )
        async def convert_sticky_note(
            note_id: str,
            parse_id: str,
            workspace_id: str,
            project_id: str,
            item_id: str | None = None,
        ) -> str:
            return await run(
                "convert_sticky_note",
                convert_sticky_note_impl,
                note_id=note_id,
                parse_id=parse_id,
                workspace_id=workspace_id,
                project_id=project_id,
                item_id=item_id,
            )

    if is_tool_enabled(settings.tool_profile, "search_plans"):

        @mcp.tool(
            name="search_plans",
            description="Search plan templates (id, title, usage_kind, period_kind, tags).",
        )
        async def search_plans(
            q: str | None = None,
            tab: str = "discover",
            limit: int = 20,
            offset: int = 0,
        ) -> str:
            return await run(
                "search_plans",
                search_plans_impl,
                q=q,
                tab=tab,
                limit=limit,
                offset=offset,
            )

    if is_tool_enabled(settings.tool_profile, "get_plan"):

        @mcp.tool(
            name="get_plan",
            description="Return a plan template with trimmed slots and the user's subscription.",
        )
        async def get_plan(plan_id: str) -> str:
            return await run("get_plan", get_plan_impl, plan_id=plan_id)

    if is_tool_enabled(settings.tool_profile, "subscribe_plan"):

        @mcp.tool(
            name="subscribe_plan",
            description=(
                "Subscribe to a plan template and create real tasks for the current period "
                "when the server imports it. Requires plans:write, workspace_id, and project_id."
            ),
        )
        async def subscribe_plan(
            plan_id: str,
            workspace_id: str,
            project_id: str,
            timezone: str | None = None,
        ) -> str:
            return await run(
                "subscribe_plan",
                subscribe_plan_impl,
                plan_id=plan_id,
                workspace_id=workspace_id,
                project_id=project_id,
                timezone=timezone or settings.default_timezone,
            )

    if is_tool_enabled(settings.tool_profile, "import_plan_period"):

        @mcp.tool(
            name="import_plan_period",
            description=(
                "Import the current plan period into the subscribed project, creating real "
                "tasks. Requires plans:write. Optional slot_ids limits which slots are created."
            ),
        )
        async def import_plan_period(
            subscription_id: str,
            slot_ids: list[str] | None = None,
        ) -> str:
            return await run(
                "import_plan_period",
                import_plan_period_impl,
                subscription_id=subscription_id,
                slot_ids=slot_ids,
            )

    if is_tool_enabled(settings.tool_profile, "list_plan_notifications"):

        @mcp.tool(
            name="list_plan_notifications",
            description="List plan notifications and the unread count.",
        )
        async def list_plan_notifications(limit: int = 20, offset: int = 0) -> str:
            return await run(
                "list_plan_notifications",
                list_plan_notifications_impl,
                limit=limit,
                offset=offset,
            )

    if is_tool_enabled(settings.tool_profile, "get_health_summary"):

        @mcp.tool(
            name="get_health_summary",
            description=(
                "Read-only health summary (timezone, current metrics, scores, insight, "
                "up to five recent workouts). Does not sync or delete health data."
            ),
        )
        async def get_health_summary(
            selected_date: str | None = None,
            range_days: int | None = None,
        ) -> str:
            return await run(
                "get_health_summary",
                get_health_summary_impl,
                selected_date=selected_date,
                range_days=range_days,
            )

    if is_tool_enabled(settings.tool_profile, "list_workouts"):

        @mcp.tool(
            name="list_workouts",
            description="List recent workouts (read-only). Optional end date (YYYY-MM-DD) and days.",
        )
        async def list_workouts(end: str | None = None, days: int | None = None) -> str:
            return await run("list_workouts", list_workouts_impl, end=end, days=days)

    if is_tool_enabled(settings.tool_profile, "get_workout"):

        @mcp.tool(
            name="get_workout",
            description=(
                "Read one workout summary, capped splits, and route point count. "
                "Does not return the full GPS track."
            ),
        )
        async def get_workout(workout_id: str) -> str:
            return await run("get_workout", get_workout_impl, workout_id=workout_id)

    if is_tool_enabled(settings.tool_profile, "get_health_metric"):

        @mcp.tool(
            name="get_health_metric",
            description="Read one health card (metric, stats, capped hourly buckets).",
        )
        async def get_health_metric(
            metric: str,
            selected_date: str | None = None,
            range_days: int | None = None,
        ) -> str:
            return await run(
                "get_health_metric",
                get_health_metric_impl,
                metric=metric,
                selected_date=selected_date,
                range_days=range_days,
            )

    if settings.tool_profile in {"p1", "full"}:
        register_resources(mcp, ctx)
        register_prompts(mcp, ctx)
