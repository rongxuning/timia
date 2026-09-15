from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "sqlite+pysqlite:///:memory:"
    jwt_secret: str = "dev_secret_change_me"
    jwt_issuer: str = "timia"
    jwt_audience: str = "timia-web"
    mobile_jwt_audience: str = "timia-ios"
    cors_origins: str = "http://127.0.0.1:3000,http://localhost:3000"
    file_internal_token: str = "dev_file_internal_change_me"
    media_backend: str = "memory"
    media_s3_endpoint: str = "http://minio:9000"
    media_s3_bucket: str = "timia-files"
    media_s3_access_key: str = "timia"
    media_s3_secret_key: str = "timia_minio_dev"
    media_s3_region: str = "us-east-1"
    media_s3_use_ssl: bool = False
    image_max_bytes: int = 10 * 1024 * 1024
    video_max_bytes: int = 200 * 1024 * 1024
    file_max_bytes: int = 20 * 1024 * 1024
    max_bindings_per_item: int = 20
    thumb_max_edge_px: int = 480

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
