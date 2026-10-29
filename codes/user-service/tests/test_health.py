from fastapi.testclient import TestClient

from app.main import app


def test_health():
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"ok": True}


def test_internal_health_requires_token():
    client = TestClient(app)
    missing = client.get("/internal/health")
    assert missing.status_code == 401
    assert missing.json()["detail"] == "invalid_token"
    ok = client.get("/internal/health", headers={"X-Internal-Token": "test_user_internal"})
    assert ok.status_code == 200
    assert ok.json()["ok"] is True
