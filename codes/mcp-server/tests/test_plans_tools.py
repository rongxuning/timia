import json

import pytest
import respx
from httpx import Response

from timia_mcp.errors import ReadonlyError
from timia_mcp.http_client import TimiaHttpClient, TimiaHttpError
from timia_mcp.tools.plans import (
    get_plan_impl,
    import_plan_period_impl,
    list_plan_notifications_impl,
    search_plans_impl,
    subscribe_plan_impl,
)


@respx.mock
async def test_search_plans_sends_query(client):
    route = respx.get("http://timia.test/views/plans").mock(
        return_value=Response(
            200,
            json={
                "items": [
                    {
                        "id": "t1",
                        "title": "晨跑",
                        "usage_kind": "repeat",
                        "period_kind": "week",
                        "visibility": "public",
                        "tags": ["运动"],
                        "use_count": 3,
                        "is_favorite": False,
                        "creator": {"id": "u1", "display_name": "Ada"},
                    }
                ]
            },
        )
    )
    out = await search_plans_impl(client, q="跑", limit=5)
    assert route.calls.last.request.url.params["q"] == "跑"
    assert out["items"][0]["creator"]["display_name"] == "Ada"


@respx.mock
async def test_get_plan_trims_slots(client):
    respx.get("http://timia.test/views/plans/t1").mock(
        return_value=Response(
            200,
            json={
                "id": "t1",
                "title": "晨跑",
                "usage_kind": "repeat",
                "period_kind": "week",
                "visibility": "public",
                "tags": [],
                "use_count": 1,
                "is_favorite": True,
                "description": "每天",
                "creator": {"id": "u1", "display_name": "Ada"},
                "slots": [
                    {
                        "id": "s1",
                        "title": "跑步",
                        "rel_day": 1,
                        "rel_month": None,
                        "start_minute": 420,
                        "end_minute": 480,
                        "all_day": False,
                        "location": "公园",
                        "body": "secret",
                        "color": "#FFFFFF",
                    }
                ],
                "my_subscription": {
                    "id": "sub1",
                    "workspace_id": "ws",
                    "project_id": "pj",
                    "timezone": "Asia/Shanghai",
                    "workspace_name": "生活",
                },
            },
        )
    )
    out = await get_plan_impl(client, "t1")
    assert out["slots"][0]["location"] == "公园"
    assert "body" not in out["slots"][0]
    assert "workspace_name" not in out["my_subscription"]


@respx.mock
async def test_subscribe_plan_posts_workspace_and_project(client):
    route = respx.post("http://timia.test/plan-templates/t1/subscribe").mock(
        return_value=Response(
            201,
            json={
                "id": "sub1",
                "imported_current_period": True,
                "apply_run": {
                    "id": "run1",
                    "status": "applied",
                    "item_count": 2,
                    "template_version": 1,
                    "workspace_id": "ws",
                    "project_id": "pj",
                    "period_start": "2026-09-20",
                    "skipped_slots": [],
                },
            },
        )
    )
    out = await subscribe_plan_impl(client, "t1", workspace_id="ws", project_id="pj")
    body = json.loads(route.calls.last.request.content)
    assert body["workspace_id"] == "ws"
    assert body["project_id"] == "pj"
    assert body["timezone"] == "Asia/Shanghai"
    assert out["apply_run"]["item_count"] == 2
    assert "skipped_slots" not in out["apply_run"]


@respx.mock
async def test_import_plan_period_optional_slots(client):
    route = respx.post(
        "http://timia.test/plan-subscriptions/sub1/import-current-period"
    ).mock(
        return_value=Response(
            200,
            json={
                "id": "run1",
                "status": "applied",
                "item_count": 1,
                "template_version": 2,
                "workspace_id": "ws",
                "project_id": "pj",
                "period_start": "2026-09-20",
            },
        )
    )
    out = await import_plan_period_impl(client, "sub1", slot_ids=["s1"])
    body = json.loads(route.calls.last.request.content)
    assert body == {"slot_ids": ["s1"]}
    assert out["id"] == "run1"


@respx.mock
async def test_subscribe_403(client):
    respx.post("http://timia.test/plan-templates/t1/subscribe").mock(
        return_value=Response(403, json={"detail": "insufficient_scope"})
    )
    with pytest.raises(TimiaHttpError) as exc_info:
        await subscribe_plan_impl(client, "t1", workspace_id="ws", project_id="pj")
    assert exc_info.value.status == 403
    assert exc_info.value.detail == "insufficient_scope"


async def test_readonly_blocks_import(settings):
    settings = settings.model_copy(update={"readonly": True})
    client = TimiaHttpClient(settings)
    with pytest.raises(ReadonlyError):
        await import_plan_period_impl(client, "sub1")


@respx.mock
async def test_list_plan_notifications(client):
    respx.get("http://timia.test/views/plan-notifications").mock(
        return_value=Response(
            200,
            json={
                "items": [
                    {
                        "id": "n1",
                        "kind": "upcoming_period",
                        "template_id": "t1",
                        "subscription_id": "sub1",
                        "read_at": None,
                        "created_at": "2026-09-26T00:00:00Z",
                        "meta": {"x": 1},
                    }
                ],
                "unread_count": 1,
            },
        )
    )
    out = await list_plan_notifications_impl(client)
    assert out["unread_count"] == 1
    assert "meta" not in out["items"][0]
