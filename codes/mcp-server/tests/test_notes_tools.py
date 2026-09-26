import json

import pytest
import respx
from httpx import Response

from timia_mcp.errors import ReadonlyError
from timia_mcp.http_client import TimiaHttpClient
from timia_mcp.tools.notes import (
    ai_parse_sticky_note_impl,
    convert_sticky_note_impl,
    create_sticky_note_impl,
    list_sticky_notes_impl,
)


@respx.mock
async def test_list_sticky_notes_trims_rows(client):
    route = respx.get("http://timia.test/sticky-notes").mock(
        return_value=Response(
            200,
            json={
                "items": [
                    {
                        "id": "n1",
                        "title": "Note",
                        "content": "buy milk",
                        "recorded_at": "2026-09-26T01:00:00Z",
                        "timezone": "Asia/Shanghai",
                        "converted_count": 0,
                        "archived_at": None,
                        "attachments": [{"id": "a1"}],
                        "owner_user_id": "u1",
                    }
                ],
                "next_cursor": None,
            },
        )
    )
    out = await list_sticky_notes_impl(client, limit=10)
    assert route.called
    assert route.calls.last.request.url.params["limit"] == "10"
    assert "attachments" not in out["items"][0]
    assert out["items"][0]["content"] == "buy milk"


@respx.mock
async def test_create_sticky_note_posts_content(client):
    route = respx.post("http://timia.test/sticky-notes").mock(
        return_value=Response(
            201,
            json={
                "id": "n1",
                "title": None,
                "content": "记得带原型",
                "recorded_at": "2026-09-26T01:00:00Z",
                "timezone": "Asia/Shanghai",
                "converted_count": 0,
                "archived_at": None,
            },
        )
    )
    out = await create_sticky_note_impl(client, content="记得带原型")
    body = json.loads(route.calls.last.request.content)
    assert body["content"] == "记得带原型"
    assert body["timezone"] == "Asia/Shanghai"
    assert body["auto_parse"] is False
    assert out["id"] == "n1"


@respx.mock
async def test_ai_parse_posts_without_body(client):
    route = respx.post("http://timia.test/sticky-notes/n1/ai-parse").mock(
        return_value=Response(
            200,
            json={
                "id": "p1",
                "sticky_note_id": "n1",
                "parse_status": "success",
                "draft": {"title": "买菜"},
                "confidence": 0.8,
                "assumptions": [],
                "missing_fields": [],
                "ambiguities": [],
                "converted_item_id": None,
                "error_code": None,
                "parse_provider": "minimax",
            },
        )
    )
    out = await ai_parse_sticky_note_impl(client, "n1")
    assert route.called
    assert out["draft"]["title"] == "买菜"
    assert "parse_provider" not in out


@respx.mock
async def test_convert_creates_item_with_workspace_and_project(client):
    route = respx.post("http://timia.test/sticky-notes/n1/convert").mock(
        return_value=Response(
            200,
            json={
                "item": {
                    "id": "i1",
                    "version": 1,
                    "title": "买菜",
                    "status": "todo",
                    "start_at": None,
                    "end_at": None,
                    "body": "long",
                },
                "sticky_note": {"id": "n1"},
                "parse": {
                    "id": "p1",
                    "sticky_note_id": "n1",
                    "parse_status": "success",
                    "converted_item_id": "i1",
                },
            },
        )
    )
    out = await convert_sticky_note_impl(
        client, "n1", parse_id="p1", workspace_id="ws", project_id="pj"
    )
    body = json.loads(route.calls.last.request.content)
    assert body == {"parse_id": "p1", "workspace_id": "ws", "project_id": "pj"}
    assert out["item"]["version"] == 1
    assert "body" not in out["item"]


async def test_readonly_blocks_convert(settings):
    settings = settings.model_copy(update={"readonly": True})
    client = TimiaHttpClient(settings)
    with pytest.raises(ReadonlyError):
        await convert_sticky_note_impl(
            client, "n1", parse_id="p1", workspace_id="ws", project_id="pj"
        )
