from fastapi.testclient import TestClient

from app.main import app
from app.schemas.item import ItemCreate
from app.schemas.project import ProjectCreate
from app.schemas.workspace import WorkspaceCreate


def test_requires_auth_for_workspaces():
    client = TestClient(app)
    resp = client.get("/workspaces")
    assert resp.status_code == 401


def test_requires_auth_for_workspace_cards():
    client = TestClient(app)
    resp = client.get("/workspaces/cards")
    assert resp.status_code == 401


def test_requires_auth_for_workspace_favorite():
    client = TestClient(app)
    resp = client.patch(
        "/workspaces/00000000-0000-0000-0000-000000000000/favorite",
        json={"is_favorite": True},
    )
    assert resp.status_code == 401


def test_workspace_create_defaults_to_white():
    payload = WorkspaceCreate(name="Workspace")
    assert payload.color == "#FFFFFF"


def test_project_create_defaults_to_white():
    payload = ProjectCreate(name="Project")
    assert payload.color == "#FFFFFF"


def test_item_create_defaults_to_white():
    payload = ItemCreate(title="Task")
    assert payload.color == "#FFFFFF"


def test_requires_auth_for_project_favorite():
    client = TestClient(app)
    resp = client.patch(
        "/workspaces/00000000-0000-0000-0000-000000000000/projects/"
        "00000000-0000-0000-0000-000000000000/favorite",
        json={"is_favorite": True},
    )
    assert resp.status_code == 401
