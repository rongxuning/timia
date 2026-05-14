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


settings = Settings()

