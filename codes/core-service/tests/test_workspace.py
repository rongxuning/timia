from fastapi.testclient import TestClient

from app.main import app


def test_requires_auth_for_workspaces():
    client = TestClient(app)
    resp = client.get("/workspaces")
    assert resp.status_code == 401


def test_requires_auth_for_workspace_cards():
    client = TestClient(app)
    resp = client.get("/workspaces/cards")
    assert resp.status_code == 401

