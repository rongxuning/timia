from __future__ import annotations

from typing import Any

from timia_mcp.auth import assert_writable
from timia_mcp.http_client import TimiaHttpClient

_COMMENT_KEYS = ("id", "author_display_name", "body", "created_at", "parent_comment_id")


def trim_comment(comment: dict[str, Any]) -> dict[str, Any]:
    return {key: comment[key] for key in _COMMENT_KEYS if key in comment}


def _comments_path(workspace_id: str, project_id: str, item_id: str) -> str:
    return f"/workspaces/{workspace_id}/projects/{project_id}/items/{item_id}/comments"


async def list_comments_impl(
    client: TimiaHttpClient,
    workspace_id: str,
    project_id: str,
    item_id: str,
) -> list[dict[str, Any]]:
    data = await client.request(
        "GET",
        _comments_path(workspace_id, project_id, item_id),
    )
    return [trim_comment(row) for row in data]


async def add_comment_impl(
    client: TimiaHttpClient,
    workspace_id: str,
    project_id: str,
    item_id: str,
    body: str,
) -> dict[str, Any]:
    assert_writable(client._settings)
    data = await client.request(
        "POST",
        _comments_path(workspace_id, project_id, item_id),
        json={"body": body},
    )
    return trim_comment(data)
