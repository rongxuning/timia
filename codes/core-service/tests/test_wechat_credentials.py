"""Credential selection and unionid/openid identity for mobile code exchange."""

from app.core.config import settings
from app.services.provider_auth import ProviderAuthError, verify_wechat_login
from app.services.wechat_credentials import select_wechat_credentials, wechat_identity_key


def test_selects_web_and_mobile_apps_independently():
    assert select_wechat_credentials(
        "web",
        web_app_id="wxweb",
        web_app_secret="web-secret",
        mobile_app_id="wxmobile",
        mobile_app_secret="mobile-secret",
        legacy_app_id="wxlegacy",
        legacy_app_secret="legacy-secret",
    ) == ("wxweb", "web-secret")
    assert select_wechat_credentials(
        "mobile",
        web_app_id="wxweb",
        web_app_secret="web-secret",
        mobile_app_id="wxmobile",
        mobile_app_secret="mobile-secret",
        legacy_app_id="wxlegacy",
        legacy_app_secret="legacy-secret",
    ) == ("wxmobile", "mobile-secret")


def test_legacy_wechat_app_is_the_fallback_for_both_clients():
    kwargs = {
        "web_app_id": "",
        "web_app_secret": "",
        "mobile_app_id": "",
        "mobile_app_secret": "",
        "legacy_app_id": "wxlegacy",
        "legacy_app_secret": "legacy-secret",
    }
    assert select_wechat_credentials("web", **kwargs) == ("wxlegacy", "legacy-secret")
    assert select_wechat_credentials("mobile", **kwargs) == ("wxlegacy", "legacy-secret")


def test_unionid_collapses_web_and_mobile_openid_fallback_does_not():
    assert wechat_identity_key(unionid="U", openid="ow", app_id="wxweb") == ("wechat", "U")
    assert wechat_identity_key(unionid="U", openid="om", app_id="wxmobile") == ("wechat", "U")
    assert wechat_identity_key(unionid="", openid="ow", app_id="wxweb") == ("wxweb", "ow")
    assert wechat_identity_key(unionid="", openid="om", app_id="wxmobile") == ("wxmobile", "om")


def test_mobile_exchange_uses_mobile_secret_and_unionid(monkeypatch):
    monkeypatch.setattr(settings, "oauth_dev_mode", False)
    monkeypatch.setattr(settings, "wechat_web_app_id", "wxweb")
    monkeypatch.setattr(settings, "wechat_web_app_secret", "web-secret")
    monkeypatch.setattr(settings, "wechat_mobile_app_id", "wxmobile")
    monkeypatch.setattr(settings, "wechat_mobile_app_secret", "mobile-secret")
    monkeypatch.setattr(settings, "wechat_app_id", "wxlegacy")
    monkeypatch.setattr(settings, "wechat_app_secret", "legacy-secret")
    calls: list[dict] = []

    def fake_get(url, params=None, timeout=None):
        calls.append({"url": url, "params": dict(params or {})})

        class Response:
            def json(self):
                return {"openid": "om", "unionid": "union-9", "access_token": "tok"}

        return Response()

    monkeypatch.setattr("app.services.provider_auth.httpx.get", fake_get)
    profile = verify_wechat_login(code="mobile-code", client="mobile")
    assert profile.provider == "wechat"
    assert profile.provider_tenant == "wechat"
    assert profile.subject == "union-9"
    assert calls[0]["params"]["appid"] == "wxmobile"
    assert calls[0]["params"]["secret"] == "mobile-secret"
    assert len(calls) == 1


def test_web_exchange_falls_back_to_legacy_then_openid(monkeypatch):
    monkeypatch.setattr(settings, "oauth_dev_mode", False)
    monkeypatch.setattr(settings, "wechat_web_app_id", "")
    monkeypatch.setattr(settings, "wechat_web_app_secret", "")
    monkeypatch.setattr(settings, "wechat_mobile_app_id", "wxmobile")
    monkeypatch.setattr(settings, "wechat_mobile_app_secret", "mobile-secret")
    monkeypatch.setattr(settings, "wechat_app_id", "wxlegacy")
    monkeypatch.setattr(settings, "wechat_app_secret", "legacy-secret")
    calls: list[str] = []

    def fake_get(url, params=None, timeout=None):
        calls.append(url)
        sent = dict(params or {})

        class Response:
            def json(self):
                if url.endswith("/userinfo"):
                    return {"openid": sent.get("openid") or "ow"}
                assert sent["appid"] == "wxlegacy"
                assert sent["secret"] == "legacy-secret"
                return {"openid": "ow", "access_token": "tok"}

        return Response()

    monkeypatch.setattr("app.services.provider_auth.httpx.get", fake_get)
    profile = verify_wechat_login(code="web-code", client="web")
    assert profile.provider_tenant == "wxlegacy"
    assert profile.subject == "ow"
    assert calls[0].endswith("/access_token")
    assert calls[1].endswith("/userinfo")


def test_missing_wechat_config_stays_provider_not_configured(monkeypatch):
    monkeypatch.setattr(settings, "oauth_dev_mode", False)
    monkeypatch.setattr(settings, "wechat_app_id", "")
    monkeypatch.setattr(settings, "wechat_app_secret", "")
    monkeypatch.setattr(settings, "wechat_web_app_id", "")
    monkeypatch.setattr(settings, "wechat_web_app_secret", "")
    monkeypatch.setattr(settings, "wechat_mobile_app_id", "")
    monkeypatch.setattr(settings, "wechat_mobile_app_secret", "")
    try:
        verify_wechat_login(code="x", client="mobile")
    except ProviderAuthError as exc:
        assert exc.detail == "provider_not_configured"
        assert exc.status_code == 503
    else:
        raise AssertionError("expected provider_not_configured")
