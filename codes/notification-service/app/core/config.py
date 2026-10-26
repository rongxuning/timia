from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite+pysqlite:///:memory:"
    jwt_secret: str = "dev_secret_change_me"
    jwt_issuer: str = "timia"
    jwt_audience: str = "timia-web"
    mobile_jwt_audience: str = "timia-ios"
    cors_origins: str = "http://127.0.0.1:3000,http://localhost:3000"
    notification_internal_token: str = "dev_notification_internal_change_me"

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
