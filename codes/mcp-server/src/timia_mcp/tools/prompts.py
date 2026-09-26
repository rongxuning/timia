from __future__ import annotations

from typing import Any

try:
    from mcp.server.fastmcp import FastMCP as _MCPApp
except ImportError:
    from mcp.server.mcpserver import MCPServer as _MCPApp


def register_prompts(mcp: _MCPApp, ctx: Any) -> None:
    """Message templates only. They do not write data."""
    timezone = ctx.settings.default_timezone

    @mcp.prompt(
        name="daily_briefing",
        description="Guide a read-only daily briefing from today's schedule and overdue items.",
    )
    def daily_briefing(timezone_name: str | None = None) -> str:
        zone = timezone_name or timezone
        return (
            "Prepare a daily briefing for the authenticated user. "
            f"Call get_schedule with view=day and timezone={zone}, then list_overdue "
            f"with timezone={zone}. Summarize times, places, and people already in the "
            "task data. Do not create, update, or complete items."
        )

    @mcp.prompt(
        name="triage_overdue",
        description="List overdue items and suggest complete-or-reschedule steps.",
    )
    def triage_overdue(workspace_id: str | None = None) -> str:
        scope = f"workspace_id={workspace_id}" if workspace_id else "scope=me"
        return (
            f"Call list_overdue with {scope}. For each item, suggest either complete_item "
            "or update_item with a new start_at/end_at. Ask the user to confirm before "
            "any write. Always pass the current version."
        )

    @mcp.prompt(
        name="nl_to_schedule",
        description="Parse natural language, then ask before creating a task.",
    )
    def nl_to_schedule(text: str) -> str:
        return (
            "Call parse_natural_language with the user's text. Show the draft title, "
            "description, time, workspace, and project. Create the item with create_item "
            "only after the user confirms. Text:\n"
            f"{text}"
        )

    @mcp.prompt(
        name="sticky_to_item",
        description="Guide sticky-note parse then convert into a real task.",
    )
    def sticky_to_item(note_id: str) -> str:
        return (
            f"Call ai_parse_sticky_note for note_id={note_id}. Show the draft and ask the "
            "user for workspace_id and project_id. Then call convert_sticky_note, which "
            "creates a real schedule item. Do not convert before the user confirms."
        )
