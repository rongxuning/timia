from __future__ import annotations

P0_TOOLS: set[str] = {
    "whoami",
    "list_workspaces",
    "list_projects",
    "get_schedule",
    "get_schedule_dashboard",
    "list_overdue",
    "list_undated",
    "list_priority",
    "get_item",
    "list_items",
    "create_item",
    "update_item",
    "complete_item",
    "parse_natural_language",
    "get_workspace_dashboard",
    "get_project_dashboard",
    "get_activity",
    "list_comments",
    "add_comment",
}

P1_TOOLS: set[str] = P0_TOOLS | {
    "list_sticky_notes",
    "create_sticky_note",
    "ai_parse_sticky_note",
    "convert_sticky_note",
    "search_plans",
    "get_plan",
    "subscribe_plan",
    "import_plan_period",
    "list_plan_notifications",
}
FULL_TOOLS: set[str] = P1_TOOLS | {
    "get_health_summary",
    "list_workouts",
    "get_workout",
    "get_health_metric",
}

_PROFILE_TOOLS: dict[str, set[str]] = {
    "p0": P0_TOOLS,
    "p1": P1_TOOLS,
    "full": FULL_TOOLS,
}


def is_tool_enabled(profile: str, name: str) -> bool:
    tools = _PROFILE_TOOLS.get(profile, P0_TOOLS)
    return name in tools
