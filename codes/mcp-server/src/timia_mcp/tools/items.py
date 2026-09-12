from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from timia_mcp.auth import assert_writable
from timia_mcp.http_client import TimiaHttpClient

_ITEM_SUMMARY_KEYS = ("id", "version", "title", "start_at", "end_at", "status")


def trim_item_summary(item: dict[str, Any]) -> dict[str, Any]:
    return {key: item[key] for key in _ITEM_SUMMARY_KEYS if key in item}


def _items_base_path(workspace_id: str, project_id: str) -> str:
    return f"/workspaces/{workspace_id}/projects/{project_id}/items"


async def get_item_impl(
    client: TimiaHttpClient,
    workspace_id: str,
    project_id: str,
    item_id: str,
) -> dict[str, Any]:
    data = await client.request(
        "GET", f"{_items_base_path(workspace_id, project_id)}/{item_id}"
    )
    return trim_item_summary(data)


async def list_items_impl(
    client: TimiaHttpClient,
    workspace_id: str,
    project_id: str,
    status: str | None = None,
    limit: int | None = None,
) -> list[dict[str, Any]]:
    params: dict[str, Any] = {}
    if status is not None:
        params["status_filter"] = status
    data = await client.request(
        "GET", _items_base_path(workspace_id, project_id), params=params or None
    )
    rows = [trim_item_summary(row) for row in data]
    if limit is not None:
        rows = rows[:limit]
    return rows


async def create_item_impl(
    client: TimiaHttpClient,
    workspace_id: str,
    project_id: str,
    title: str,
    *,
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
) -> dict[str, Any]:
    assert_writable(client._settings)
    payload: dict[str, Any] = {"title": title}
    for key, value in (
        ("body", body),
        ("color", color),
        ("status", status),
        ("priority", priority),
        ("start_at", start_at),
        ("end_at", end_at),
        ("location", location),
        ("details", details),
        ("assignee_user_id", assignee_user_id),
        ("participant_user_ids", participant_user_ids),
        ("repeat", repeat),
    ):
        if value is not None:
            payload[key] = value
    data = await client.request(
        "POST",
        _items_base_path(workspace_id, project_id),
        json=payload,
    )
    return trim_item_summary(data)


async def update_item_impl(
    client: TimiaHttpClient,
    workspace_id: str,
    project_id: str,
    item_id: str,
    version: int,
    *,
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
) -> dict[str, Any]:
    assert_writable(client._settings)
    payload: dict[str, Any] = {"version": version}
    for key, value in (
        ("title", title),
        ("body", body),
        ("color", color),
        ("status", status),
        ("priority", priority),
        ("start_at", start_at),
        ("end_at", end_at),
        ("completed_at", completed_at),
        ("location", location),
        ("details", details),
        ("assignee_user_id", assignee_user_id),
        ("participant_user_ids", participant_user_ids),
        ("repeat", repeat),
    ):
        if value is not None:
            payload[key] = value
    data = await client.request(
        "PATCH",
        f"{_items_base_path(workspace_id, project_id)}/{item_id}",
        json=payload,
    )
    return trim_item_summary(data)


async def complete_item_impl(
    client: TimiaHttpClient,
    workspace_id: str,
    project_id: str,
    item_id: str,
    version: int,
) -> dict[str, Any]:
    assert_writable(client._settings)
    payload = {
        "version": version,
        "status": "done",
        "completed_at": datetime.now(UTC).isoformat(),
    }
    data = await client.request(
        "PATCH",
        f"{_items_base_path(workspace_id, project_id)}/{item_id}",
        json=payload,
    )
    return trim_item_summary(data)


async def parse_natural_language_impl(
    client: TimiaHttpClient,
    text: str,
    reference_time: str,
    selected_date: str,
    timezone: str | None = None,
) -> dict[str, Any]:
    assert_writable(client._settings)
    payload = {
        "text": text,
        "timezone": timezone or client._settings.default_timezone,
        "reference_time": reference_time,
        "selected_date": selected_date,
    }
    return await client.request(
        "POST",
        "/views/schedule/natural-language/parse",
        json=payload,
    )
