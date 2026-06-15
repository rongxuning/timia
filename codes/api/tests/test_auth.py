from fastapi.testclient import TestClient

from app.main import app


def test_health_ok():
    client = TestClient(app)
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}


def test_requires_auth_for_users_list():
    client = TestClient(app)
    resp = client.get("/users")
    assert resp.status_code == 401


def test_requires_auth_for_assignable_users():
    client = TestClient(app)
    resp = client.get("/users/assignable")
    assert resp.status_code == 401


def test_requires_auth_for_user_workspaces():
    client = TestClient(app)
    resp = client.get("/users/00000000-0000-0000-0000-000000000000/workspaces")
    assert resp.status_code == 401


def test_requires_auth_for_views_users_directory():
    client = TestClient(app)
    resp = client.get("/views/users/directory")
    assert resp.status_code == 401


def test_requires_auth_for_views_workspace_activity():
    client = TestClient(app)
    resp = client.get("/views/workspace/00000000-0000-0000-0000-000000000000/activity")
    assert resp.status_code == 401

