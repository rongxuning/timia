import json

import pytest
import respx
from httpx import Response

from timia_mcp.errors import ReadonlyError, tool_error_from_http
from timia_mcp.http_client import TimiaHttpError
from timia_mcp.tools.items import (
    complete_item_impl,
    create_item_impl,
    get_item_impl,
    list_items_impl,
    parse_natural_language_impl,
    update_item_impl,
)

ITEM_PATH = "http://timia.test/workspaces/ws1/projects/p1/items"
SUMMARY_KEYS = {"id", "version", "title", "start_at", "end_at", "status"}


def _item_response(**overrides):
    base = {
        "id": "i1",
        "title": "Task",
        "body": "details",
        "color": "#FFFFFF",
        "status": "todo",
        "priority": "1",
        "start_at": "2026-09-11T09:00:00Z",
        "end_at": "2026-09-11T10:00:00Z",
        "completed_at": None,
        "details": None,
        "version": 2,
        "location": None,
    }
    base.update(overrides)
    return base


@respx.mock
async def test_create_item_posts_to_correct_path(client):
    route = respx.post(ITEM_PATH).mock(
        return_value=Response(201, json=_item_response(title="New task"))
    )
    out = await create_item_impl(client, "ws1", "p1", title="New task")
    assert route.called
    body = json.loads(route.calls.last.request.content)
    assert body == {"title": "New task"}
    assert set(out.keys()) == SUMMARY_KEYS
    assert out["title"] == "New task"
    assert out["version"] == 2


@respx.mock
async def test_update_item_sends_version(client):
    route = respx.patch(f"{ITEM_PATH}/i1").mock(
        return_value=Response(200, json=_item_response(status="doing", version=3))
    )
    out = await update_item_impl(
        client, "ws1", "p1", "i1", version=2, status="doing"
    )
    assert route.called
    body = json.loads(route.calls.last.request.content)
    assert body["version"] == 2
    assert body["status"] == "doing"
    assert out["status"] == "doing"
    assert out["version"] == 3


@respx.mock
async def test_update_item_409_maps_to_version_conflict(client):
    respx.patch(f"{ITEM_PATH}/i1").mock(
        return_value=Response(409, json={"detail": "version_conflict"})
    )
    with pytest.raises(TimiaHttpError) as exc_info:
        await update_item_impl(client, "ws1", "p1", "i1", version=1, title="x")
    err = tool_error_from_http(exc_info.value.status, exc_info.value.detail)
    assert err["error"] == "version_conflict"
    assert err["http_status"] == 409


async def test_readonly_blocks_create_item_impl(settings):
    settings = settings.model_copy(update={"readonly": True})
    from timia_mcp.http_client import TimiaHttpClient

    client = TimiaHttpClient(settings)
    with pytest.raises(ReadonlyError):
        await create_item_impl(client, "ws1", "p1", title="blocked")


@respx.mock
async def test_parse_natural_language_posts_body(client):
    route = respx.post("http://timia.test/views/schedule/natural-language/parse").mock(
        return_value=Response(
            200,
            json={
                "draft": {"title": "Meeting", "status": "todo", "priority": "1"},
                "confidence": 0.9,
                "assumptions": [],
                "missing_fields": [],
                "ambiguities": [],
            },
        )
    )
    out = await parse_natural_language_impl(
        client,
        text="meeting tomorrow 9am",
        reference_time="2026-09-11T08:00:00+08:00",
        selected_date="2026-09-11",
    )
    assert route.called
    body = json.loads(route.calls.last.request.content)
    assert body["text"] == "meeting tomorrow 9am"
    assert body["timezone"] == "Asia/Shanghai"
    assert body["reference_time"] == "2026-09-11T08:00:00+08:00"
    assert body["selected_date"] == "2026-09-11"
    assert out["draft"]["title"] == "Meeting"


@respx.mock
async def test_get_item_returns_summary(client):
    route = respx.get(f"{ITEM_PATH}/i1").mock(
        return_value=Response(200, json=_item_response())
    )
    out = await get_item_impl(client, "ws1", "p1", "i1")
    assert route.called
    assert set(out.keys()) == SUMMARY_KEYS


@respx.mock
async def test_list_items_trims_and_supports_limit(client):
    route = respx.get(ITEM_PATH).mock(
        return_value=Response(
            200,
            json=[
                _item_response(id="i1"),
                _item_response(id="i2", title="Second"),
            ],
        )
    )
    out = await list_items_impl(client, "ws1", "p1", limit=1)
    assert route.called
    assert len(out) == 1
    assert set(out[0].keys()) == SUMMARY_KEYS


@respx.mock
async def test_complete_item_patches_done_status(client):
    route = respx.patch(f"{ITEM_PATH}/i1").mock(
        return_value=Response(200, json=_item_response(status="done", version=4))
    )
    out = await complete_item_impl(client, "ws1", "p1", "i1", version=3)
    assert route.called
    body = json.loads(route.calls.last.request.content)
    assert body["version"] == 3
    assert body["status"] == "done"
    assert "completed_at" in body
    assert out["status"] == "done"
