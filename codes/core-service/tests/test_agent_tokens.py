"""Integration tests for agent token HTTP API."""

import secrets
import uuid

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select

from app.core.config import settings
from app.core.security import create_access_token, hash_password
from app.db.deps import get_db
from app.main import app
from app.models.activity import ActivityLog
from app.models.agent_token import AgentToken, AgentToolCall
from app.models.item import Item
from app.models.project import Project, ProjectFavorite, ProjectMember
from app.models.user import User
from app.models.workspace import Workspace, WorkspaceMember


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _make_user(db, suffix: str) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"agent-token-{suffix}@example.com",
        display_name=f"agent-token-{suffix}",
        password_hash=hash_password("password123!"),
        status="active",
        system_role="user",
    )
    db.add(user)
    db.commit()
    return user


def _cleanup(db, user: User) -> None:
    db.execute(delete(AgentToolCall).where(AgentToolCall.user_id == user.id))
    db.execute(delete(AgentToken).where(AgentToken.user_id == user.id))
    workspaces = list(
        db.scalars(select(Workspace).where(Workspace.created_by_user_id == user.id)).all()
    )
    ws_ids = [w.id for w in workspaces]
    if ws_ids:
        db.execute(delete(ActivityLog).where(ActivityLog.workspace_id.in_(ws_ids)))
        db.execute(delete(Item).where(Item.workspace_id.in_(ws_ids)))
        db.execute(delete(ProjectFavorite).where(ProjectFavorite.workspace_id.in_(ws_ids)))
        db.execute(delete(ProjectMember).where(ProjectMember.workspace_id.in_(ws_ids)))
        db.execute(delete(Project).where(Project.workspace_id.in_(ws_ids)))
        db.execute(delete(WorkspaceMember).where(WorkspaceMember.workspace_id.in_(ws_ids)))
        db.execute(delete(Workspace).where(Workspace.id.in_(ws_ids)))
    db.execute(delete(User).where(User.id == user.id))
    db.commit()


@pytest.fixture
def client_and_user_headers():
    db = next(get_db())
    suffix = secrets.token_hex(4)
    user = _make_user(db, suffix)
    token = create_access_token(subject=str(user.id), audience=settings.jwt_audience)
    client = TestClient(app)
    try:
        yield client, _headers(token)
    finally:
        _cleanup(db, user)
        db.close()


@pytest.fixture
def workspace_project_ids(client_and_user_headers):
    client, headers = client_and_user_headers
    ws = client.post(
        "/workspaces",
        json={"name": "agent-token-ws", "color": "#AABBCC"},
        headers=headers,
    )
    assert ws.status_code == 201, ws.text
    workspace_id = ws.json()["id"]
    pj = client.post(
        f"/workspaces/{workspace_id}/projects",
        json={"name": "agent-token-pj"},
        headers=headers,
    )
    assert pj.status_code == 201, pj.text
    return workspace_id, pj.json()["id"]


def test_create_list_revoke_agent_token(client_and_user_headers):
    client, headers = client_and_user_headers
    created = client.post(
        "/auth/agent-tokens",
        headers=headers,
        json={"name": "cursor"},
    )
    assert created.status_code == 201
    body = created.json()
    assert body["token"].startswith("tm_pat_")
    token_id = body["id"]
    listed = client.get("/auth/agent-tokens", headers=headers)
    assert listed.status_code == 200
    assert all("token" not in row for row in listed.json())
    me = client.get("/auth/me", headers={"Authorization": f"Bearer {body['token']}"})
    assert me.status_code == 200
    denied = client.get(
        "/health/sync-status",
        headers={"Authorization": f"Bearer {body['token']}"},
    )
    assert denied.status_code == 403
    assert denied.json()["detail"] in {"pat_path_not_allowed", "insufficient_scope"}
    revoked = client.delete(f"/auth/agent-tokens/{token_id}", headers=headers)
    assert revoked.status_code == 204
    me2 = client.get("/auth/me", headers={"Authorization": f"Bearer {body['token']}"})
    assert me2.status_code == 401


def test_pat_without_schedule_write_cannot_create_item(
    client_and_user_headers, workspace_project_ids
):
    client, headers = client_and_user_headers
    ws, pj = workspace_project_ids
    created = client.post(
        "/auth/agent-tokens",
        headers=headers,
        json={
            "name": "ro",
            "scopes": ["profile:read", "schedule:read", "workspace:read", "admin:tokens"],
        },
    )
    pat = created.json()["token"]
    resp = client.post(
        f"/workspaces/{ws}/projects/{pj}/items",
        headers={"Authorization": f"Bearer {pat}"},
        json={"title": "x"},
    )
    assert resp.status_code == 403
    assert resp.json()["detail"] == "insufficient_scope"


def test_audit_requires_pat(client_and_user_headers):
    client, headers = client_and_user_headers
    resp = client.post(
        "/auth/agent-tokens/audit",
        headers=headers,
        json={"tool_name": "whoami", "ok": True},
    )
    assert resp.status_code == 401
    assert resp.json()["detail"] == "pat_required"


def test_audit_records_tool_call(client_and_user_headers):
    client, headers = client_and_user_headers
    created = client.post(
        "/auth/agent-tokens",
        headers=headers,
        json={"name": "audit-test"},
    )
    assert created.status_code == 201
    pat = created.json()["token"]
    pat_headers = {"Authorization": f"Bearer {pat}"}
    resp = client.post(
        "/auth/agent-tokens/audit",
        headers=pat_headers,
        json={
            "tool_name": "list_workspaces",
            "ok": True,
            "latency_ms": 42,
            "request_meta": {"path": "/workspaces", "note": "x" * 300},
        },
    )
    assert resp.status_code == 204

    db = next(get_db())
    try:
        row = db.scalar(
            select(AgentToolCall).where(AgentToolCall.tool_name == "list_workspaces")
        )
        assert row is not None
        assert row.ok is True
        assert row.latency_ms == 42
        assert len(row.request_meta["note"]) == 200
    finally:
        db.close()


def test_list_workspaces_includes_role(client_and_user_headers):
    client, headers = client_and_user_headers
    created = client.post(
        "/workspaces",
        json={"name": "role-ws", "color": "#112233"},
        headers=headers,
    )
    assert created.status_code == 201
    listed = client.get("/workspaces", headers=headers)
    assert listed.status_code == 200
    match = next(row for row in listed.json() if row["name"] == "role-ws")
    assert match["role"] == "owner"
