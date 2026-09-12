from __future__ import annotations

from typing import Any

from timia_mcp.http_client import TimiaHttpClient

_ITEM_KEYS = (
    "id",
    "title",
    "status",
    "start_at",
    "end_at",
    "project_id",
    "workspace_id",
    "priority",
)


def trim_schedule_item(item: dict[str, Any]) -> dict[str, Any]:
    return {key: item[key] for key in _ITEM_KEYS if key in item}


def extract_calendar_items(data: dict[str, Any]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    seen: set[str] = set()

    for week in data.get("weeks", []):
        for segment in week.get("segments", []):
            raw = segment.get("item")
            if not raw:
                continue
            item_id = raw.get("id")
            if item_id in seen:
                continue
            seen.add(item_id)
            items.append(trim_schedule_item(raw))

    day = data.get("day")
    if day:
        for raw in day.get("items", []):
            item_id = raw.get("id")
            if item_id in seen:
                continue
            seen.add(item_id)
            items.append(trim_schedule_item(raw))

    return items


def extract_item_list(data: dict[str, Any]) -> list[dict[str, Any]]:
    return [trim_schedule_item(item) for item in data.get("items", [])]


def extract_priority_items(data: dict[str, Any]) -> list[dict[str, Any]]:
    items: list[dict[str, Any]] = []
    for quadrant_items in data.get("quadrants", {}).values():
        for raw in quadrant_items:
            items.append(trim_schedule_item(raw))
    return items


def _schedule_scope_params(
    scope: str,
    workspace_id: str | None,
    project_id: str | None,
) -> dict[str, Any]:
    params: dict[str, Any] = {"scope": scope}
    if workspace_id is not None:
        params["workspace_id"] = workspace_id
    if project_id is not None:
        params["project_id"] = project_id
    return params


async def get_schedule_impl(
    client: TimiaHttpClient,
    view: str = "week",
    anchor: str | None = None,
    scope: str = "me",
    workspace_id: str | None = None,
    project_id: str | None = None,
    timezone: str | None = None,
) -> list[dict[str, Any]]:
    params: dict[str, Any] = {
        "view": view,
        "timezone": timezone or client._settings.default_timezone,
        **_schedule_scope_params(scope, workspace_id, project_id),
    }
    if anchor is not None:
        params["anchor"] = anchor
    data = await client.request("GET", "/views/schedule/calendar", params=params)
    return extract_calendar_items(data)


async def get_schedule_dashboard_impl(client: TimiaHttpClient) -> dict[str, Any]:
    return await client.request("GET", "/views/schedule/dashboard")


async def list_overdue_impl(
    client: TimiaHttpClient,
    scope: str = "me",
    workspace_id: str | None = None,
    project_id: str | None = None,
    timezone: str | None = None,
) -> list[dict[str, Any]]:
    params: dict[str, Any] = {
        "timezone": timezone or client._settings.default_timezone,
        **_schedule_scope_params(scope, workspace_id, project_id),
    }
    data = await client.request("GET", "/views/schedule/overdue", params=params)
    return extract_item_list(data)


async def list_undated_impl(
    client: TimiaHttpClient,
    scope: str = "me",
    workspace_id: str | None = None,
    project_id: str | None = None,
) -> list[dict[str, Any]]:
    params = _schedule_scope_params(scope, workspace_id, project_id)
    data = await client.request("GET", "/views/schedule/undated", params=params)
    return extract_item_list(data)


async def list_priority_impl(
    client: TimiaHttpClient,
    scope: str = "me",
    workspace_id: str | None = None,
    project_id: str | None = None,
) -> list[dict[str, Any]]:
    params = _schedule_scope_params(scope, workspace_id, project_id)
    data = await client.request("GET", "/views/schedule/priority", params=params)
    return extract_priority_items(data)
