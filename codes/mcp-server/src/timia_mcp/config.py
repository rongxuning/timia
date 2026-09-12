from __future__ import annotations

import os
from typing import Literal

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

ToolProfile = Literal["p0", "p1", "full"]
Transport = Literal["stdio", "http"]


class Settings(BaseSettings):
    """Env uses TIMIA_MCP_* names; prefer property aliases transport/host/port."""

    model_config = SettingsConfigDict(env_prefix="TIMIA_", case_sensitive=False)

    api_base: str
    pat: str | None = None
    readonly: bool = False
    tool_profile: ToolProfile = "p0"
    timeout_seconds: int = 30
    default_timezone: str = "Asia/Shanghai"
    mcp_transport: Transport = "stdio"
    mcp_host: str = "127.0.0.1"
    mcp_port: int = 8100
    mcp_path: str = "/mcp"

    @field_validator("api_base")
    @classmethod
    def strip_trailing_slash(cls, value: str) -> str:
        return value.rstrip("/")

    @property
    def transport(self) -> Transport:
        return self.mcp_transport

    @property
    def host(self) -> str:
        return self.mcp_host

    @property
    def port(self) -> int:
        return self.mcp_port


def load_settings() -> Settings:
    if not os.environ.get("TIMIA_API_BASE"):
        raise ValueError("TIMIA_API_BASE is required")
    transport = (os.environ.get("TIMIA_MCP_TRANSPORT") or "stdio").strip().lower()
    if transport not in ("stdio", "http"):
        raise ValueError("TIMIA_MCP_TRANSPORT must be 'stdio' or 'http'")
    if transport == "stdio" and not os.environ.get("TIMIA_PAT"):
        raise ValueError("TIMIA_PAT is required")
    return Settings()
