from __future__ import annotations

from typing import Any

from timia_mcp.auth import assert_writable
from timia_mcp.http_client import TimiaHttpClient

_CARD_KEYS = (
    "id",
    "title",
    "usage_kind",
    "period_kind",
    "visibility",
    "tags",
    "use_count",
    "is_favorite",
)
_SLOT_KEYS = (
    "id",
    "title",
    "rel_day",
    "rel_month",
    "start_minute",
    "end_minute",
    "all_day",
    "location",
)
_RUN_KEYS = (
    "id",
    "status",
    "item_count",
    "template_version",
    "workspace_id",
    "project_id",
    "period_start",
)


def trim_plan_card(card: dict[str, Any]) -> dict[str, Any]:
    out = {key: card[key] for key in _CARD_KEYS if key in card}
    creator = card.get("creator")
    if isinstance(creator, dict):
        out["creator"] = {
            "id": creator.get("id"),
            "display_name": creator.get("display_name"),
        }
    return out


def trim_apply_run(run: dict[str, Any] | None) -> dict[str, Any] | None:
    if not run:
        return None
    return {key: run[key] for key in _RUN_KEYS if key in run}


async def search_plans_impl(
    client: TimiaHttpClient,
    q: str | None = None,
    tab: str = "discover",
    limit: int = 20,
    offset: int = 0,
) -> dict[str, Any]:
    params: dict[str, Any] = {"tab": tab, "limit": limit, "offset": offset}
    if q is not None:
        params["q"] = q
    data = await client.request("GET", "/views/plans", params=params)
    items = data.get("items") or []
    return {"items": [trim_plan_card(row) for row in items]}


async def get_plan_impl(client: TimiaHttpClient, plan_id: str) -> dict[str, Any]:
    data = await client.request("GET", f"/views/plans/{plan_id}")
    out = trim_plan_card(data)
    out["description"] = data.get("description")
    slots = data.get("slots") or []
    out["slots"] = [{key: slot[key] for key in _SLOT_KEYS if key in slot} for slot in slots]
    subscription = data.get("my_subscription")
    if isinstance(subscription, dict):
        out["my_subscription"] = {
            key: subscription[key]
            for key in ("id", "workspace_id", "project_id", "timezone")
            if key in subscription
        }
    else:
        out["my_subscription"] = None
    return out


async def subscribe_plan_impl(
    client: TimiaHttpClient,
    plan_id: str,
    workspace_id: str,
    project_id: str,
    timezone: str | None = None,
) -> dict[str, Any]:
    assert_writable(client._settings)
    payload = {
        "workspace_id": workspace_id,
        "project_id": project_id,
        "timezone": timezone or client._settings.default_timezone,
    }
    data = await client.request("POST", f"/plan-templates/{plan_id}/subscribe", json=payload)
    return {
        "id": data.get("id"),
        "imported_current_period": data.get("imported_current_period"),
        "apply_run": trim_apply_run(data.get("apply_run")),
    }


async def import_plan_period_impl(
    client: TimiaHttpClient,
    subscription_id: str,
    slot_ids: list[str] | None = None,
) -> dict[str, Any]:
    assert_writable(client._settings)
    payload = None if slot_ids is None else {"slot_ids": slot_ids}
    data = await client.request(
        "POST",
        f"/plan-subscriptions/{subscription_id}/import-current-period",
        json=payload,
    )
    trimmed = trim_apply_run(data) or {}
    return trimmed


async def list_plan_notifications_impl(
    client: TimiaHttpClient,
    limit: int = 20,
    offset: int = 0,
) -> dict[str, Any]:
    data = await client.request(
        "GET",
        "/views/plan-notifications",
        params={"limit": limit, "offset": offset},
    )
    items = data.get("items") or []
    keys = ("id", "kind", "template_id", "subscription_id", "read_at", "created_at")
    return {
        "items": [{key: row[key] for key in keys if key in row} for row in items],
        "unread_count": data.get("unread_count", 0),
    }
