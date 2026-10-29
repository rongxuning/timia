from urllib.parse import parse_qs, urlparse

import httpx
from sqlalchemy import select

from app.core.config import settings
from app.models.identity import AuthIdentity, WebSession
from app.services.core_proxy import set_transport


def test_start_redirects_to_qrconnect_with_website_app(monkeypatch, client):
    monkeypatch.setattr(settings, "wechat_web_app_id", "wxweb")
    monkeypatch.setattr(settings, "wechat_web_app_secret", "web-secret")
    monkeypatch.setattr(settings, "wechat_mobile_app_id", "wxmobile")
    monkeypatch.setattr(
        settings,
        "wechat_web_redirect_uri",
        "https://timia.online/auth/wechat/web/callback",
    )
    response = client.get("/auth/wechat/web/start", follow_redirects=False)
    assert response.status_code == 302
    location = response.headers["location"]
    assert location.startswith("https://open.weixin.qq.com/connect/qrconnect?")
    parsed = urlparse(location)
    query = parse_qs(parsed.query)
    assert query["appid"] == ["wxweb"]
    assert query["scope"] == ["snsapi_login"]
    assert query["redirect_uri"] == ["https://timia.online/auth/wechat/web/callback"]
    assert "timia_wx_state=" in response.headers["set-cookie"]


def test_start_without_website_app_returns_to_login(monkeypatch, client):
    monkeypatch.setattr(settings, "wechat_web_app_id", "")
    monkeypatch.setattr(settings, "wechat_web_app_secret", "")
    monkeypatch.setattr(settings, "wechat_app_id", "")
    monkeypatch.setattr(settings, "wechat_app_secret", "")
    monkeypatch.setattr(
        settings,
        "wechat_web_redirect_uri",
        "https://timia.online/auth/wechat/web/callback",
    )
    response = client.get("/auth/wechat/web/start", follow_redirects=False)
    assert response.status_code == 302
    assert response.headers["location"].endswith("wechat_error=provider_not_configured")


def test_callback_stores_unionid_and_sets_refresh_cookie(monkeypatch, client, db):
    monkeypatch.setattr(settings, "wechat_web_app_id", "wxweb")
    monkeypatch.setattr(settings, "wechat_web_app_secret", "web-secret")
    monkeypatch.setattr(settings, "oauth_dev_mode", False)
    monkeypatch.setattr(settings, "wechat_web_redirect_uri", "https://timia.online/cb")

    def fake_get(url, params=None, timeout=None):
        class Response:
            def json(self):
                return {"openid": "open-web", "unionid": "union-1", "access_token": "tok"}

        return Response()

    monkeypatch.setattr("app.services.wechat_web.httpx.get", fake_get)
    start = client.get("/auth/wechat/web/start", follow_redirects=False)
    state = parse_qs(urlparse(start.headers["location"]).query)["state"][0]
    callback = client.get(
        "/auth/wechat/web/callback",
        params={"code": "auth-code", "state": state},
        follow_redirects=False,
    )
    assert callback.status_code == 302
    assert callback.headers["location"].endswith("/login?wechat=1")
    assert f"{settings.web_cookie_name}=" in callback.headers["set-cookie"]
    db.expire_all()
    identity = db.scalar(select(AuthIdentity).where(AuthIdentity.provider_subject == "union-1"))
    assert identity is not None
    assert identity.provider == "wechat"
    assert identity.provider_tenant == "wechat"
    session = db.scalar(select(WebSession).where(WebSession.user_id == identity.user_id))
    assert session is not None
    assert session.login_provider == "wechat"


def test_callback_openid_fallback_uses_website_app_id(monkeypatch, client, db):
    monkeypatch.setattr(settings, "wechat_web_app_id", "wxweb")
    monkeypatch.setattr(settings, "wechat_web_app_secret", "web-secret")
    monkeypatch.setattr(settings, "oauth_dev_mode", False)

    def fake_get(url, params=None, timeout=None):
        class Response:
            def json(self):
                if str(url).endswith("/userinfo"):
                    return {"openid": "open-only"}
                return {"openid": "open-only", "access_token": "tok"}

        return Response()

    monkeypatch.setattr("app.services.wechat_web.httpx.get", fake_get)
    client.cookies.set("timia_wx_state", "state-a", path="/auth")
    response = client.get(
        "/auth/wechat/web/callback",
        params={"code": "c", "state": "state-a"},
        follow_redirects=False,
    )
    assert response.status_code == 302
    assert response.headers["location"].endswith("/login?wechat=1")
    db.expire_all()
    identity = db.scalar(select(AuthIdentity).where(AuthIdentity.provider_subject == "open-only"))
    assert identity is not None
    assert identity.provider_tenant == "wxweb"


def test_callback_rejects_a_mismatched_state(client):
    client.cookies.set("timia_wx_state", "expected", path="/auth")
    response = client.get(
        "/auth/wechat/web/callback",
        params={"code": "c", "state": "other"},
        follow_redirects=False,
    )
    assert response.status_code == 302
    assert "wechat_error=invalid_state" in response.headers["location"]


def test_auth_proxy_forwards_cookie_and_does_not_swallow_wechat(client):
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["path"] = request.url.path
        seen["cookie"] = request.headers.get("cookie")
        return httpx.Response(
            200,
            json={"access_token": "at"},
            headers={"set-cookie": "timia_rt=rotated; Path=/auth; HttpOnly"},
        )

    set_transport(httpx.MockTransport(handler))
    try:
        response = client.post(
            "/auth/login",
            headers={"cookie": "timia_rt=old"},
            json={"email": "a@b.c", "password": "secret123"},
        )
    finally:
        set_transport(None)
    assert response.status_code == 200
    assert seen["path"] == "/auth/login"
    assert seen["cookie"] == "timia_rt=old"
    assert response.json()["access_token"] == "at"
    assert "timia_rt=rotated" in response.headers["set-cookie"]
