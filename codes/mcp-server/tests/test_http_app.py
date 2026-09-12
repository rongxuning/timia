from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from timia_mcp.config import Settings
from timia_mcp.http_app import create_http_app


@pytest.fixture
def http_settings() -> Settings:
    return Settings(
        api_base="http://timia.test",
        pat=None,
        mcp_transport="http",
        mcp_host="0.0.0.0",
        mcp_port=8100,
        mcp_path="/mcp",
    )


@pytest.fixture
def app(http_settings: Settings):
    return create_http_app(http_settings, include_auth_probe=True)


@pytest.mark.asyncio
async def test_health(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        r = await ac.get("/health")
        assert r.status_code == 200
        assert r.json()["ok"] is True
        assert r.json()["transport"] == "http"


@pytest.mark.asyncio
async def test_mcp_requires_auth(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        r = await ac.post("/mcp", json={})
        assert r.status_code == 401
        assert r.json()["error"] == "unauthorized"


@pytest.mark.asyncio
async def test_mcp_rejects_non_pat_bearer(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        r = await ac.post(
            "/mcp",
            json={},
            headers={"Authorization": "Bearer not_a_pat"},
        )
        assert r.status_code == 401


@pytest.mark.asyncio
async def test_middleware_sets_request_client(app):
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        r = await ac.get(
            "/__auth_probe",
            headers={"Authorization": "Bearer tm_pat_test_token"},
        )
        assert r.status_code == 200
        body = r.json()
        assert body["ok"] is True
        assert body["authorization_scheme"] == "Bearer"
        assert body["pat_prefix"] == "tm_pat_"
