from __future__ import annotations

from typing import Any

from timia_mcp.auth import assert_writable
from timia_mcp.http_client import TimiaHttpClient

_NOTE_KEYS = (
    "id",
    "title",
    "content",
    "recorded_at",
    "timezone",
    "converted_count",
    "archived_at",
)
_PARSE_KEYS = (
    "id",
    "sticky_note_id",
    "parse_status",
    "draft",
    "confidence",
    "assumptions",
    "missing_fields",
    "ambiguities",
    "converted_item_id",
    "error_code",
)


def trim_note(note: dict[str, Any]) -> dict[str, Any]:
    return {key: note[key] for key in _NOTE_KEYS if key in note}


def trim_parse(parse: dict[str, Any]) -> dict[str, Any]:
    return {key: parse[key] for key in _PARSE_KEYS if key in parse}


async def list_sticky_notes_impl(
    client: TimiaHttpClient,
    limit: int = 20,
    cursor: str | None = None,
    include_archived: bool = False,
) -> dict[str, Any]:
    params: dict[str, Any] = {"limit": limit, "include_archived": include_archived}
    if cursor is not None:
        params["cursor"] = cursor
    data = await client.request("GET", "/sticky-notes", params=params)
    items = data.get("items") or []
    return {
        "items": [trim_note(row) for row in items],
        "next_cursor": data.get("next_cursor"),
    }


async def create_sticky_note_impl(
    client: TimiaHttpClient,
    content: str,
    title: str | None = None,
    timezone: str | None = None,
    auto_parse: bool = False,
) -> dict[str, Any]:
    assert_writable(client._settings)
    payload: dict[str, Any] = {
        "content": content,
        "timezone": timezone or client._settings.default_timezone,
        "auto_parse": auto_parse,
    }
    if title is not None:
        payload["title"] = title
    data = await client.request("POST", "/sticky-notes", json=payload)
    return trim_note(data)


async def ai_parse_sticky_note_impl(client: TimiaHttpClient, note_id: str) -> dict[str, Any]:
    assert_writable(client._settings)
    data = await client.request("POST", f"/sticky-notes/{note_id}/ai-parse")
    return trim_parse(data)


async def convert_sticky_note_impl(
    client: TimiaHttpClient,
    note_id: str,
    parse_id: str,
    workspace_id: str,
    project_id: str,
    item_id: str | None = None,
) -> dict[str, Any]:
    assert_writable(client._settings)
    payload: dict[str, Any] = {
        "parse_id": parse_id,
        "workspace_id": workspace_id,
        "project_id": project_id,
    }
    if item_id is not None:
        payload["item_id"] = item_id
    data = await client.request("POST", f"/sticky-notes/{note_id}/convert", json=payload)
    item = data.get("item") or {}
    parse = data.get("parse") or {}
    return {
        "item": {
            key: item[key]
            for key in ("id", "version", "title", "status", "start_at", "end_at")
            if key in item
        },
        "sticky_note_id": (data.get("sticky_note") or {}).get("id", note_id),
        "parse": trim_parse(parse),
    }
