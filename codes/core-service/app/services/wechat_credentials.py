"""WeChat website-app vs mobile-app credentials and the identity key.

Unionid is the cross-app subject (provider_tenant ``wechat``). Without a unionid,
openid is stored under the app id that exchanged the code.

Keep this file in lockstep with
``codes/user-service/app/services/wechat_credentials.py``.
"""

from __future__ import annotations

from typing import Literal
from urllib.parse import quote

WeChatClient = Literal["web", "mobile"]


def select_wechat_credentials(
    client: WeChatClient,
    *,
    web_app_id: str = "",
    web_app_secret: str = "",
    mobile_app_id: str = "",
    mobile_app_secret: str = "",
    legacy_app_id: str = "",
    legacy_app_secret: str = "",
) -> tuple[str, str]:
    """Return (app_id, secret) for the client.

    A client-specific app id wins as a pair with its own secret. An empty
    client-specific id falls back to the legacy WECHAT_APP_* pair so existing
    single-app deployments keep working.
    """
    if client == "web" and web_app_id.strip():
        return web_app_id.strip(), web_app_secret.strip()
    if client == "mobile" and mobile_app_id.strip():
        return mobile_app_id.strip(), mobile_app_secret.strip()
    return legacy_app_id.strip(), legacy_app_secret.strip()


def wechat_identity_key(*, unionid: str, openid: str, app_id: str) -> tuple[str, str] | None:
    """Return (provider_tenant, provider_subject), or None when nothing identifies the user."""
    union = unionid.strip()
    if union:
        return ("wechat", union)
    open_id = openid.strip()
    app = app_id.strip()
    if open_id and app:
        return (app, open_id)
    return None


def qrconnect_url(*, app_id: str, redirect_uri: str, state: str) -> str:
    """Website-app QR authorize URL. Scope is snsapi_login, not the mobile scope."""
    query = (
        f"appid={quote(app_id, safe='')}"
        f"&redirect_uri={quote(redirect_uri, safe='')}"
        f"&response_type=code"
        f"&scope=snsapi_login"
        f"&state={quote(state, safe='')}"
    )
    return f"https://open.weixin.qq.com/connect/qrconnect?{query}#wechat_redirect"
