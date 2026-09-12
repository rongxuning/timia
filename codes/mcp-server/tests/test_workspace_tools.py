import respx
from httpx import Response

from timia_mcp.tools.workspace import (
    get_activity_impl,
    get_project_dashboard_impl,
    get_workspace_dashboard_impl,
    list_projects_impl,
    list_workspaces_impl,
)


@respx.mock
async def test_list_workspaces_trims_fields(client):
    respx.get("http://timia.test/workspaces").mock(
        return_value=Response(
            200,
            json=[
                {
                    "id": "ws1",
                    "name": "Alpha",
                    "role": "owner",
                    "is_favorite": True,
                    "description": "hidden",
                    "color": "#FFFFFF",
                },
                {
                    "id": "ws2",
                    "name": "Beta",
                    "role": "member",
                    "is_favorite": False,
                },
            ],
        )
    )
    out = await list_workspaces_impl(client)
    assert out == [
        {"id": "ws1", "name": "Alpha", "role": "owner", "is_favorite": True},
        {"id": "ws2", "name": "Beta", "role": "member", "is_favorite": False},
    ]


@respx.mock
async def test_list_workspaces_favorite_only(client):
    respx.get("http://timia.test/workspaces").mock(
        return_value=Response(
            200,
            json=[
                {"id": "ws1", "name": "Alpha", "role": "owner", "is_favorite": True},
                {"id": "ws2", "name": "Beta", "role": "member", "is_favorite": False},
            ],
        )
    )
    out = await list_workspaces_impl(client, favorite_only=True)
    assert len(out) == 1
    assert out[0]["id"] == "ws1"


@respx.mock
async def test_list_projects(client):
    route = respx.get("http://timia.test/workspaces/ws1/projects").mock(
        return_value=Response(
            200,
            json=[
                {
                    "id": "p1",
                    "name": "Proj",
                    "archived": False,
                    "workspace_id": "ws1",
                    "description": None,
                    "color": "#FFFFFF",
                    "created_at": "2026-01-01T00:00:00Z",
                    "is_favorite": False,
                    "can_manage": True,
                }
            ],
        )
    )
    out = await list_projects_impl(client, "ws1")
    assert route.called
    assert out == [{"id": "p1", "name": "Proj", "archived": False}]


@respx.mock
async def test_get_workspace_dashboard(client):
    route = respx.get("http://timia.test/views/workspace/ws1/dashboard").mock(
        return_value=Response(
            200,
            json={"workspace_id": "ws1", "name": "Alpha", "stats": {"project_count": 2}},
        )
    )
    out = await get_workspace_dashboard_impl(client, "ws1")
    assert route.called
    assert out["workspace_id"] == "ws1"
    assert out["stats"]["project_count"] == 2


@respx.mock
async def test_get_project_dashboard(client):
    route = respx.get("http://timia.test/views/workspace/ws1/projects/p1/dashboard").mock(
        return_value=Response(
            200,
            json={"project_id": "p1", "name": "Proj", "archived": False},
        )
    )
    out = await get_project_dashboard_impl(client, "ws1", "p1")
    assert route.called
    assert out["project_id"] == "p1"


@respx.mock
async def test_get_activity_passes_limit(client):
    route = respx.get("http://timia.test/views/workspace/ws1/activity").mock(
        return_value=Response(
            200,
            json={"workspace_id": "ws1", "name": "Alpha", "total_count": 1, "items": []},
        )
    )
    out = await get_activity_impl(client, "ws1", limit=25)
    assert route.called
    assert route.calls.last.request.url.params["limit"] == "25"
    assert out["workspace_id"] == "ws1"
