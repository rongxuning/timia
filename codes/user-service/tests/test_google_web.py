import base64
import hashlib
from urllib.parse import parse_qs, urlparse

from sqlalchemy import select

from app.core.config import settings
from app.models.identity import AuthIdentity, WebSession


def test_start_redirects_to_google_with_pkce(monkeypatch, client):
    _configure(monkeypatch)
    response = client.get("/auth/google/web/start", follow_redirects=False)
    assert response.status_code == 302
    location = response.headers["location"]
    assert location.startswith("https://accounts.google.com/o/oauth2/v2/auth?")
    query = parse_qs(urlparse(location).query)
    assert query["client_id"] == ["web-client.apps.googleusercontent.com"]
    assert query["redirect_uri"] == ["https://timia.online/auth/google/web/callback"]
    assert query["code_challenge_method"] == ["S256"]
    assert query["scope"] == ["openid email profile"]
    verifier = client.cookies.get("timia_gg_verifier")
    digest = hashlib.sha256(verifier.encode()).digest()
    challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()
    assert query["code_challenge"] == [challenge]
    assert "timia_gg_state=" in response.headers["set-cookie"]


def test_start_without_client_returns_to_login(monkeypatch, client):
    monkeypatch.setattr(settings, "google_web_client_id", "")
    monkeypatch.setattr(settings, "google_web_client_secret", "")
    monkeypatch.setattr(settings, "google_web_redirect_uri", "")
    response = client.get("/auth/google/web/start", follow_redirects=False)
    assert response.status_code == 302
    assert response.headers["location"].endswith("google_error=provider_not_configured")


def test_callback_sets_refresh_cookie(monkeypatch, client, db):
    _configure(monkeypatch)
    monkeypatch.setattr(settings, "oauth_dev_mode", False)
    monkeypatch.setattr("app.services.google_web.httpx.post", _fake_post)
    monkeypatch.setattr("app.services.google_web.httpx.get", _fake_get)

    start = client.get("/auth/google/web/start", follow_redirects=False)
    state = parse_qs(urlparse(start.headers["location"]).query)["state"][0]
    callback = client.get(
        "/auth/google/web/callback",
        params={"code": "auth-code", "state": state},
        follow_redirects=False,
    )
    assert callback.status_code == 302
    assert callback.headers["location"].endswith("/login?google=1")
    assert f"{settings.web_cookie_name}=" in callback.headers["set-cookie"]
    db.expire_all()
    identity = db.scalar(select(AuthIdentity).where(AuthIdentity.provider_subject == "google-sub-1"))
    assert identity is not None
    assert identity.provider == "google"
    assert identity.provider_tenant == "google"
    assert identity.normalized_email == "ada@example.com"
    assert identity.email_verified is True
    session = db.scalar(select(WebSession).where(WebSession.user_id == identity.user_id))
    assert session is not None
    assert session.login_provider == "google"


def test_callback_rejects_a_mismatched_state(client):
    client.cookies.set("timia_gg_state", "expected", path="/auth")
    client.cookies.set("timia_gg_verifier", "verifier-value", path="/auth")
    response = client.get(
        "/auth/google/web/callback",
        params={"code": "c", "state": "other"},
        follow_redirects=False,
    )
    assert response.status_code == 302
    assert "google_error=invalid_state" in response.headers["location"]


def _configure(monkeypatch) -> None:
    monkeypatch.setattr(settings, "google_web_client_id", "web-client.apps.googleusercontent.com")
    monkeypatch.setattr(settings, "google_web_client_secret", "web-secret")
    monkeypatch.setattr(
        settings,
        "google_web_redirect_uri",
        "https://timia.online/auth/google/web/callback",
    )


def _fake_post(url, data=None, timeout=None):
    assert "oauth2.googleapis.com/token" in str(url)
    assert data["code"] == "auth-code"
    assert data["code_verifier"]
    assert data["client_id"] == "web-client.apps.googleusercontent.com"

    class Response:
        status_code = 200

        def json(self):
            return {"id_token": "id-token-1"}

    return Response()


def _fake_get(url, params=None, timeout=None):
    assert params["id_token"] == "id-token-1"

    class Response:
        status_code = 200

        def json(self):
            return {
                "aud": "web-client.apps.googleusercontent.com",
                "iss": "https://accounts.google.com",
                "sub": "google-sub-1",
                "email": "ada@example.com",
                "email_verified": "true",
                "name": "Ada Lovelace",
            }

    return Response()
