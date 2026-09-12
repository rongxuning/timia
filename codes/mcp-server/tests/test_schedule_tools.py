import respx
from httpx import Response

from timia_mcp.tools.schedule import (
    get_schedule_dashboard_impl,
    get_schedule_impl,
    list_overdue_impl,
    list_priority_impl,
    list_undated_impl,
)

TRIMMED_KEYS = {
    "id",
    "title",
    "status",
    "start_at",
    "end_at",
    "project_id",
    "workspace_id",
    "priority",
}


def _sample_item(**overrides):
    base = {
        "id": "i1",
        "title": "Task",
        "status": "todo",
        "start_at": "2026-09-11T09:00:00Z",
        "end_at": "2026-09-11T10:00:00Z",
        "project_id": "p1",
        "workspace_id": "ws1",
        "priority": "1",
        "body": "noise",
        "version": 3,
    }
    base.update(overrides)
    return base


@respx.mock
async def test_get_schedule_week_query_and_trim(client):
    route = respx.get("http://timia.test/views/schedule/calendar").mock(
        return_value=Response(
            200,
            json={
                "view": "week",
                "anchor": "2026-09-08",
                "weeks": [
                    {
                        "days": [],
                        "segments": [
                            {
                                "item": _sample_item(),
                                "col_start": 0,
                                "col_span": 1,
                                "lane": 0,
                                "round_left": True,
                                "round_right": True,
                            }
                        ],
                    }
                ],
            },
        )
    )
    out = await get_schedule_impl(client, view="week", anchor="2026-09-08")
    assert route.called
    params = route.calls.last.request.url.params
    assert params["view"] == "week"
    assert params["scope"] == "me"
    assert params["anchor"] == "2026-09-08"
    assert params["timezone"] == "Asia/Shanghai"
    assert len(out) == 1
    assert set(out[0].keys()) <= TRIMMED_KEYS
    assert out[0]["id"] == "i1"
    assert "body" not in out[0]
    assert "version" not in out[0]


@respx.mock
async def test_get_schedule_dashboard(client):
    route = respx.get("http://timia.test/views/schedule/dashboard").mock(
        return_value=Response(
            200,
            json={
                "display_name": "User",
                "email": "a@b.c",
                "task_total": 5,
                "todo_count": 2,
                "overdue_count": 1,
            },
        )
    )
    out = await get_schedule_dashboard_impl(client)
    assert route.called
    assert out["task_total"] == 5
    assert out["overdue_count"] == 1


@respx.mock
async def test_list_overdue_trims_and_scope(client):
    route = respx.get("http://timia.test/views/schedule/overdue").mock(
        return_value=Response(
            200,
            json={"items": [_sample_item(id="o1")], "total": 1, "has_more": False},
        )
    )
    out = await list_overdue_impl(client, scope="me", timezone="Asia/Shanghai")
    assert route.called
    params = route.calls.last.request.url.params
    assert params["scope"] == "me"
    assert params["timezone"] == "Asia/Shanghai"
    assert len(out) == 1
    assert set(out[0].keys()) <= TRIMMED_KEYS
    assert out[0]["id"] == "o1"


@respx.mock
async def test_list_undated_trims(client):
    respx.get("http://timia.test/views/schedule/undated").mock(
        return_value=Response(200, json={"items": [_sample_item(id="u1", start_at=None)]})
    )
    out = await list_undated_impl(client)
    assert len(out) == 1
    assert out[0]["id"] == "u1"


@respx.mock
async def test_list_priority_trims_quadrants(client):
    respx.get("http://timia.test/views/schedule/priority").mock(
        return_value=Response(
            200,
            json={
                "quadrants": {
                    "urgent_important": [_sample_item(id="q1")],
                    "not_urgent_important": [],
                }
            },
        )
    )
    out = await list_priority_impl(client)
    assert len(out) == 1
    assert out[0]["id"] == "q1"
    assert set(out[0].keys()) <= TRIMMED_KEYS
