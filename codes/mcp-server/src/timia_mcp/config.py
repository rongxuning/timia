from __future__ import annotations

import os
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ToolProfile = Literal["p0", "p1", "full"]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="TIMIA_", case_sensitive=False)

    api_base: str
    pat: str
    readonly: bool = False
    tool_profile: ToolProfile = "p0"
    timeout_seconds: int = 30
    default_timezone: str = "Asia/Shanghai"

    @field_validator("api_base")
    @classmethod
    def strip_trailing_slash(cls, value: str) -> str:
        return value.rstrip("/")


def load_settings() -> Settings:
    if not os.environ.get("TIMIA_API_BASE"):
        raise ValueError("TIMIA_API_BASE is required")
    if not os.environ.get("TIMIA_PAT"):
        raise ValueError("TIMIA_PAT is required")
    return Settings()
