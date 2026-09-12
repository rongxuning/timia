import respx
from httpx import Response

from timia_mcp.tools.profile import whoami_impl


@respx.mock
async def test_whoami(client):
    respx.get("http://timia.test/auth/me").mock(
        return_value=Response(
            200,
            json={
                "id": "u1",
                "email": "a@b.c",
                "display_name": "A",
                "system_role": "user",
            },
        )
    )
    out = await whoami_impl(client)
    assert out["email"] == "a@b.c"
    assert out["display_name"] == "A"
