from __future__ import annotations

from timia_mcp.http_client import TimiaHttpClient


async def whoami_impl(client: TimiaHttpClient) -> dict:
    data = await client.request("GET", "/auth/me")
    return {
        "id": data["id"],
        "email": data["email"],
        "display_name": data["display_name"],
        "system_role": data["system_role"],
    }
