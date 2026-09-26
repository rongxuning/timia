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
        ("GET", "/sticky-notes", "notes:read"),
        ("GET", "/sticky-notes/n1", "notes:read"),
        ("POST", "/sticky-notes", "notes:write"),
        ("POST", "/sticky-notes/n1/ai-parse", "notes:write"),
        ("POST", "/sticky-notes/n1/convert", "notes:write"),
        ("PATCH", "/sticky-notes/n1", "notes:write"),
        ("GET", "/views/plans", "plans:read"),
        ("GET", "/views/plans/p1", "plans:read"),
        ("GET", "/views/plan-notifications", "plans:read"),
        ("POST", "/plan-templates/t1/subscribe", "plans:write"),
        ("POST", "/plan-subscriptions/s1/import-current-period", "plans:write"),
        ("GET", "/views/me/health", "health:read"),
        ("GET", "/views/me/health/workouts", "health:read"),
        ("GET", "/views/me/health/workouts/w1", "health:read"),
        ("GET", "/views/me/health/cards/steps", "health:read"),
    ],
)
def test_required_scope_for_request(method, path, expected):
    assert required_scope_for_request(method, path) == expected


def test_unknown_path_returns_sentinel():
    assert required_scope_for_request("GET", "/health/sync/samples") == "__deny__"
    assert required_scope_for_request("DELETE", "/health/data") == "__deny__"
    assert required_scope_for_request("GET", "/dev/db-tables") == "__deny__"
    assert required_scope_for_request("DELETE", "/sticky-notes/n1") == "__deny__"
    assert required_scope_for_request("POST", "/plan-templates/t1/apply") == "__deny__"
