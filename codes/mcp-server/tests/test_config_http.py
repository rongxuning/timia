import pytest

from timia_mcp.config import load_settings


def test_http_transport_allows_missing_pat(monkeypatch):
    monkeypatch.setenv("TIMIA_API_BASE", "http://core-service:8000")
    monkeypatch.delenv("TIMIA_PAT", raising=False)
    monkeypatch.setenv("TIMIA_MCP_TRANSPORT", "http")
    s = load_settings()
    assert s.transport == "http"
    assert s.pat is None


def test_stdio_still_requires_pat(monkeypatch):
    monkeypatch.setenv("TIMIA_API_BASE", "http://127.0.0.1:8000")
    monkeypatch.delenv("TIMIA_PAT", raising=False)
    monkeypatch.setenv("TIMIA_MCP_TRANSPORT", "stdio")
    with pytest.raises(ValueError, match="TIMIA_PAT"):
        load_settings()


def test_http_client_accepts_pat_override(monkeypatch):
    monkeypatch.setenv("TIMIA_API_BASE", "http://127.0.0.1:8000")
    monkeypatch.delenv("TIMIA_PAT", raising=False)
    monkeypatch.setenv("TIMIA_MCP_TRANSPORT", "http")
    settings = load_settings()
    from timia_mcp.http_client import TimiaHttpClient

    client = TimiaHttpClient(settings, pat="tm_pat_override")
    assert client._client.headers["Authorization"] == "Bearer tm_pat_override"
