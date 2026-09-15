from fastapi.testclient import TestClient

from app.main import app


def test_health_ok():
    client = TestClient(app)
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"ok": True}


def test_files_require_auth():
    client = TestClient(app)
    resp = client.get("/files", params={"workspace_id": "11111111-1111-1111-1111-111111111111"})
    assert resp.status_code == 401


def test_pat_is_rejected():
    client = TestClient(app)
    resp = client.get(
        "/files",
        params={"workspace_id": "11111111-1111-1111-1111-111111111111"},
        headers={"Authorization": "Bearer tm_pat_abc"},
    )
    assert resp.status_code == 401
