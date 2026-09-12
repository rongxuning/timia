import pytest

from app.services.agent_tokens import required_scope_for_request


@pytest.mark.parametrize(
    ("method", "path", "expected"),
    [
        ("GET", "/auth/me", "profile:read"),
        ("GET", "/auth/agent-tokens", "admin:tokens"),
        ("POST", "/auth/agent-tokens", "admin:tokens"),
        ("DELETE", "/auth/agent-tokens/abc", "admin:tokens"),
        ("POST", "/auth/agent-tokens/audit", None),
        ("GET", "/workspaces", "workspace:read"),
        ("GET", "/views/workspace/x/activity", "workspace:read"),
        ("POST", "/workspaces/w/projects/p/items/i/comments", "workspace:write"),
        ("GET", "/views/schedule/calendar", "schedule:read"),
        ("GET", "/workspaces/w/projects/p/items", "schedule:read"),
        ("POST", "/workspaces/w/projects/p/items", "schedule:write"),
        ("PATCH", "/workspaces/w/projects/p/items/i", "schedule:write"),
        ("POST", "/views/schedule/natural-language/parse", "schedule:write"),
    ],
)
def test_required_scope_for_request(method, path, expected):
    assert required_scope_for_request(method, path) == expected


def test_unknown_path_returns_sentinel():
    assert required_scope_for_request("GET", "/health/sync/samples") == "__deny__"
