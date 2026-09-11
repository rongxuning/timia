import json

import pytest
import respx
from httpx import Response

from timia_mcp.errors import ReadonlyError
from timia_mcp.tools.comments import add_comment_impl, list_comments_impl

COMMENTS_PATH = "http://timia.test/workspaces/ws1/projects/p1/items/i1/comments"
COMMENT_KEYS = {"id", "author_display_name", "body", "created_at", "parent_comment_id"}


def _comment_response(**overrides):
    base = {
        "id": "c1",
        "author_user_id": "u1",
        "author_display_name": "Alice",
        "body": "Looks good",
        "created_at": "2026-09-11T10:00:00Z",
        "deleted_at": None,
        "parent_comment_id": None,
        "completion_status": "pending",
    }
    base.update(overrides)
    return base


@respx.mock
async def test_list_comments_gets_correct_path(client):
    route = respx.get(COMMENTS_PATH).mock(
        return_value=Response(200, json=[_comment_response(), _comment_response(id="c2")])
    )
    out = await list_comments_impl(client, "ws1", "p1", "i1")
    assert route.called
    assert len(out) == 2
    assert set(out[0].keys()) == COMMENT_KEYS
    assert out[0]["author_display_name"] == "Alice"


@respx.mock
async def test_add_comment_posts_body(client):
    route = respx.post(COMMENTS_PATH).mock(
        return_value=Response(201, json=_comment_response(body="New note"))
    )
    out = await add_comment_impl(client, "ws1", "p1", "i1", body="New note")
    assert route.called
    body = json.loads(route.calls.last.request.content)
    assert body == {"body": "New note"}
    assert set(out.keys()) == COMMENT_KEYS
    assert out["body"] == "New note"


async def test_readonly_blocks_add_comment(settings):
    settings = settings.model_copy(update={"readonly": True})
    from timia_mcp.http_client import TimiaHttpClient

    client = TimiaHttpClient(settings)
    with pytest.raises(ReadonlyError):
        await add_comment_impl(client, "ws1", "p1", "i1", body="blocked")
