from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict

CookieSameSite = Literal["lax", "strict", "none"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite+pysqlite:///:memory:"
    jwt_secret: str = "dev_secret_change_me"
    jwt_issuer: str = "timia"
    jwt_audience: str = "timia-web"
    mobile_jwt_audience: str = "timia-ios"
    web_access_token_expires_minutes: int = 30
    web_session_idle_days: int = 30
    web_session_absolute_days: int = 90
    web_cookie_secure: bool = False
    web_cookie_samesite: str = "lax"
    web_cookie_name: str = "timia_rt"
    cors_origins: str = "http://127.0.0.1:3000,http://localhost:3000"
    # Core still owns register/login/refresh/mobile until those handlers move.
    core_service_base: str = "http://127.0.0.1:8000"
    user_internal_token: str = "dev_user_internal_change_me"
    wechat_app_id: str = ""
    wechat_app_secret: str = ""
    wechat_web_app_id: str = ""
    wechat_web_app_secret: str = ""
    wechat_mobile_app_id: str = ""
    wechat_mobile_app_secret: str = ""
    wechat_web_redirect_uri: str = ""
    oauth_dev_mode: bool = False

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]

    @property
    def cookie_samesite(self) -> CookieSameSite:
        value = self.web_cookie_samesite.lower()
        if value == "strict":
            return "strict"
        if value == "none":
            return "none"
        return "lax"


settings = Settings()
