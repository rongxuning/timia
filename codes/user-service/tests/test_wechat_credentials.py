from app.services.wechat_credentials import (
    qrconnect_url,
    select_wechat_credentials,
    wechat_identity_key,
)
from app.services.wechat_web import WeChatExchangeError, exchange_wechat_code


def test_web_credentials_prefer_website_app_and_mobile_prefers_mobile_app():
    web_id, web_secret = select_wechat_credentials(
        "web",
        web_app_id="wxweb",
        web_app_secret="web-secret",
        mobile_app_id="wxmobile",
        mobile_app_secret="mobile-secret",
        legacy_app_id="wxlegacy",
        legacy_app_secret="legacy-secret",
    )
    mobile_id, mobile_secret = select_wechat_credentials(
        "mobile",
        web_app_id="wxweb",
        web_app_secret="web-secret",
        mobile_app_id="wxmobile",
        mobile_app_secret="mobile-secret",
        legacy_app_id="wxlegacy",
        legacy_app_secret="legacy-secret",
    )
    assert (web_id, web_secret) == ("wxweb", "web-secret")
    assert (mobile_id, mobile_secret) == ("wxmobile", "mobile-secret")


def test_missing_client_app_falls_back_to_legacy_pair():
    app_id, secret = select_wechat_credentials(
        "web",
        web_app_id="",
        web_app_secret="",
        mobile_app_id="wxmobile",
        mobile_app_secret="mobile-secret",
        legacy_app_id="wxlegacy",
        legacy_app_secret="legacy-secret",
    )
    assert (app_id, secret) == ("wxlegacy", "legacy-secret")


def test_specific_app_id_does_not_borrow_the_legacy_secret():
    app_id, secret = select_wechat_credentials(
        "mobile",
        mobile_app_id="wxmobile",
        mobile_app_secret="",
        legacy_app_id="wxlegacy",
        legacy_app_secret="legacy-secret",
    )
    assert (app_id, secret) == ("wxmobile", "")


def test_unionid_is_the_cross_app_identity_key():
    assert wechat_identity_key(unionid="U1", openid="O-web", app_id="wxweb") == ("wechat", "U1")
    assert wechat_identity_key(unionid="U1", openid="O-ios", app_id="wxmobile") == ("wechat", "U1")


def test_openid_fallback_is_scoped_to_the_app_that_exchanged_the_code():
    assert wechat_identity_key(unionid="", openid="O-web", app_id="wxweb") == ("wxweb", "O-web")
    assert wechat_identity_key(unionid="  ", openid="O-ios", app_id="wxmobile") == (
        "wxmobile",
        "O-ios",
    )
    assert wechat_identity_key(unionid="", openid="", app_id="wxweb") is None


def test_exchange_uses_web_app_and_falls_back_to_openid(monkeypatch):
    monkeypatch.setattr("app.services.wechat_web.settings.wechat_web_app_id", "wxweb")
    monkeypatch.setattr("app.services.wechat_web.settings.wechat_web_app_secret", "web-secret")
    monkeypatch.setattr("app.services.wechat_web.settings.wechat_mobile_app_id", "wxmobile")
    monkeypatch.setattr(
        "app.services.wechat_web.settings.wechat_mobile_app_secret", "mobile-secret"
    )
    monkeypatch.setattr("app.services.wechat_web.settings.oauth_dev_mode", False)
    calls: list[tuple[str, dict]] = []

    def fake_get(url, params=None, timeout=None):
        calls.append((url, dict(params or {})))

        class Response:
            def json(self):
                if url.endswith("/userinfo"):
                    return {"openid": "O-web"}
                return {"openid": "O-web", "access_token": "tok"}

        return Response()

    monkeypatch.setattr("app.services.wechat_web.httpx.get", fake_get)
    tenant, subject = exchange_wechat_code("code-1", client="web")
    assert (tenant, subject) == ("wxweb", "O-web")
    assert calls[0][1]["appid"] == "wxweb"
    assert calls[0][1]["secret"] == "web-secret"
    assert calls[0][0].endswith("/access_token")
    assert calls[1][0].endswith("/userinfo")


def test_exchange_prefers_unionid_without_userinfo(monkeypatch):
    monkeypatch.setattr("app.services.wechat_web.settings.wechat_mobile_app_id", "wxmobile")
    monkeypatch.setattr(
        "app.services.wechat_web.settings.wechat_mobile_app_secret", "mobile-secret"
    )
    monkeypatch.setattr("app.services.wechat_web.settings.oauth_dev_mode", False)
    calls: list[str] = []

    def fake_get(url, params=None, timeout=None):
        calls.append(url)

        class Response:
            def json(self):
                return {"openid": "O-ios", "unionid": "U-same", "access_token": "tok"}

        return Response()

    monkeypatch.setattr("app.services.wechat_web.httpx.get", fake_get)
    assert exchange_wechat_code("code-2", client="mobile") == ("wechat", "U-same")
    assert calls == ["https://api.weixin.qq.com/sns/oauth2/access_token"]


def test_exchange_reports_missing_credentials(monkeypatch):
    monkeypatch.setattr("app.services.wechat_web.settings.wechat_web_app_id", "")
    monkeypatch.setattr("app.services.wechat_web.settings.wechat_web_app_secret", "")
    monkeypatch.setattr("app.services.wechat_web.settings.wechat_app_id", "")
    monkeypatch.setattr("app.services.wechat_web.settings.wechat_app_secret", "")
    monkeypatch.setattr("app.services.wechat_web.settings.oauth_dev_mode", False)
    try:
        exchange_wechat_code("code", client="web")
    except WeChatExchangeError as exc:
        assert exc.detail == "provider_not_configured"
        assert exc.status_code == 503
    else:
        raise AssertionError("expected provider_not_configured")


def test_qrconnect_url_uses_website_scope():
    url = qrconnect_url(
        app_id="wxweb",
        redirect_uri="https://timia.online/auth/wechat/web/callback",
        state="state 1",
    )
    assert url.startswith("https://open.weixin.qq.com/connect/qrconnect?")
    assert "appid=wxweb" in url
    assert "scope=snsapi_login" in url
    assert url.endswith("#wechat_redirect")
    assert "redirect_uri=https%3A%2F%2Ftimia.online%2Fauth%2Fwechat%2Fweb%2Fcallback" in url
