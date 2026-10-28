"""Exchange a WeChat code with the website-app or mobile-app credentials."""

from __future__ import annotations

import logging

import httpx

from app.core.config import settings
from app.services.wechat_credentials import (
    WeChatClient,
    select_wechat_credentials,
    wechat_identity_key,
)

logger = logging.getLogger(__name__)


class WeChatExchangeError(RuntimeError):
    def __init__(self, detail: str, status_code: int = 401):
        super().__init__(detail)
        self.detail = detail
        self.status_code = status_code


def credentials_for(client: WeChatClient) -> tuple[str, str]:
    return select_wechat_credentials(
        client,
        web_app_id=settings.wechat_web_app_id,
        web_app_secret=settings.wechat_web_app_secret,
        mobile_app_id=settings.wechat_mobile_app_id,
        mobile_app_secret=settings.wechat_mobile_app_secret,
        legacy_app_id=settings.wechat_app_id,
        legacy_app_secret=settings.wechat_app_secret,
    )


def exchange_wechat_code(code: str, *, client: WeChatClient) -> tuple[str, str]:
    """Return (provider_tenant, provider_subject)."""
    if settings.oauth_dev_mode and code.startswith("dev:wechat:"):
        subject = code.split(":", 2)[2].strip()
        if not subject:
            raise WeChatExchangeError("invalid_provider_token")
        return ("wechat", subject)
    app_id, secret = credentials_for(client)
    if not app_id or not secret:
        raise WeChatExchangeError("provider_not_configured", 503)
    unionid, openid = _fetch_ids(code, app_id=app_id, secret=secret)
    key = wechat_identity_key(unionid=unionid, openid=openid, app_id=app_id)
    if key is None:
        raise WeChatExchangeError("invalid_provider_token")
    return key


def _fetch_ids(code: str, *, app_id: str, secret: str) -> tuple[str, str]:
    try:
        response = httpx.get(
            "https://api.weixin.qq.com/sns/oauth2/access_token",
            params={
                "appid": app_id,
                "secret": secret,
                "code": code,
                "grant_type": "authorization_code",
            },
            timeout=10,
        )
    except httpx.HTTPError as exc:
        logger.warning("wechat code exchange failed: %s", type(exc).__name__)
        raise WeChatExchangeError("provider_unavailable", 503) from exc
    data = response.json()
    if data.get("errcode"):
        raise WeChatExchangeError("invalid_provider_token")
    openid = str(data.get("openid") or "")
    unionid = str(data.get("unionid") or "")
    access_token = str(data.get("access_token") or "")
    if not unionid and access_token and openid:
        try:
            info = httpx.get(
                "https://api.weixin.qq.com/sns/userinfo",
                params={"access_token": access_token, "openid": openid, "lang": "zh_CN"},
                timeout=10,
            ).json()
        except httpx.HTTPError as exc:
            logger.warning("wechat userinfo failed: %s", type(exc).__name__)
            raise WeChatExchangeError("provider_unavailable", 503) from exc
        unionid = str(info.get("unionid") or "")
        openid = str(info.get("openid") or openid)
    return unionid, openid
