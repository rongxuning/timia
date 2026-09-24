from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class LlmApiKeyCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    base_url: str = Field(min_length=1, max_length=300)
    api_key: str = Field(min_length=8, max_length=500)
    model: str = Field(default="MiniMax-M2.7", min_length=1, max_length=80)
    enabled: bool = True
    priority: int = Field(default=100, ge=-1000, le=10000)
    timeout_seconds: float | None = Field(default=None, ge=1, le=120)


class LlmApiKeyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=80)
    base_url: str | None = Field(default=None, min_length=1, max_length=300)
    api_key: str | None = Field(default=None, min_length=8, max_length=500)
    model: str | None = Field(default=None, min_length=1, max_length=80)
    enabled: bool | None = None
    priority: int | None = Field(default=None, ge=-1000, le=10000)
    timeout_seconds: float | None = Field(default=None, ge=1, le=120)


class LlmApiKeyOut(BaseModel):
    id: str
    name: str
    base_url: str
    api_key_hint: str
    model: str
    enabled: bool
    priority: int
    timeout_seconds: float | None
    role: Literal["primary", "standby", "disabled"]
    cooldown_until: datetime | None
    last_status: str | None
    last_error: str | None
    last_used_at: datetime | None
    created_at: datetime
    updated_at: datetime


class LlmApiKeyListOut(BaseModel):
    keys: list[LlmApiKeyOut]


class LlmApiKeyProbeOut(BaseModel):
    ok: bool
    key: LlmApiKeyOut
