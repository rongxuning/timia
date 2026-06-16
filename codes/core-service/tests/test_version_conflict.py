from fastapi.testclient import TestClient

from app.main import app


def test_patch_requires_version():
    # This test is a placeholder for local integration tests after DB + seed is runnable.
    # It ensures the endpoint exists and returns auth error without token.
    client = TestClient(app)
    resp = client.patch(
        "/workspaces/00000000-0000-0000-0000-000000000000/projects/00000000-0000-0000-0000-000000000000/items/00000000-0000-0000-0000-000000000000",
        json={"version": 1, "title": "x"},
    )
    assert resp.status_code == 401

