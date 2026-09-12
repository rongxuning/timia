from __future__ import annotations

from timia_mcp.http_client import TimiaHttpClient


async def list_workspaces_impl(client: TimiaHttpClient, favorite_only: bool = False) -> list[dict]:
    data = await client.request("GET", "/workspaces")
    rows = [
        {
            "id": row["id"],
            "name": row["name"],
            "role": row.get("role"),
            "is_favorite": row.get("is_favorite", False),
        }
        for row in data
    ]
    if favorite_only:
        rows = [row for row in rows if row["is_favorite"]]
    return rows


async def list_projects_impl(client: TimiaHttpClient, workspace_id: str) -> list[dict]:
    data = await client.request("GET", f"/workspaces/{workspace_id}/projects")
    return [{"id": row["id"], "name": row["name"], "archived": row["archived"]} for row in data]


async def get_workspace_dashboard_impl(client: TimiaHttpClient, workspace_id: str) -> dict:
    return await client.request("GET", f"/views/workspace/{workspace_id}/dashboard")


async def get_project_dashboard_impl(
    client: TimiaHttpClient, workspace_id: str, project_id: str
) -> dict:
    return await client.request(
        "GET", f"/views/workspace/{workspace_id}/projects/{project_id}/dashboard"
    )


async def get_activity_impl(
    client: TimiaHttpClient, workspace_id: str, limit: int = 20
) -> dict:
    return await client.request(
        "GET",
        f"/views/workspace/{workspace_id}/activity",
        params={"limit": limit},
    )
