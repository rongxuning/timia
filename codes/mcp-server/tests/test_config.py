import pytest

from timia_mcp.config import load_settings


def test_load_settings_requires_api_base(monkeypatch):
    monkeypatch.delenv("TIMIA_API_BASE", raising=False)
    monkeypatch.delenv("TIMIA_PAT", raising=False)
    with pytest.raises(ValueError, match="TIMIA_API_BASE"):
        load_settings()


def test_load_settings_ok(monkeypatch):
    monkeypatch.setenv("TIMIA_API_BASE", "http://127.0.0.1:8000")
    monkeypatch.setenv("TIMIA_PAT", "tm_pat_test")
    monkeypatch.setenv("TIMIA_READONLY", "true")
    s = load_settings()
    assert s.api_base == "http://127.0.0.1:8000"
    assert s.readonly is True
    assert s.tool_profile == "p0"
