from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    jwt_secret: str
    jwt_issuer: str = "timia"
    jwt_audience: str = "timia-web"
    access_token_expires_minutes: int = 30
    refresh_token_expires_days: int = 14
    # Exposes GET /dev/db-tables for local documentation UI; keep false in production.
    enable_dev_db_tables: bool = False
    # Comma-separated browser origins allowed by CORS (e.g. https://app.example.com).
    cors_origins: str = "http://127.0.0.1:3000,http://localhost:3000"
    # Server-side only. The mobile and web clients must never receive this key.
    minimax_api_key: str | None = None
    minimax_model: str = "MiniMax-M2.7"
    minimax_base_url: str = "https://api.minimaxi.com/v1"
    minimax_timeout_seconds: float = 30.0

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
