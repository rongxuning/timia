from datetime import datetime

from pydantic import BaseModel, Field


class AgentTokenCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    scopes: list[str] | None = None
    expires_at: datetime | None = None


class AgentTokenOut(BaseModel):
    id: str
    name: str
    token_prefix: str
    scopes: list[str]
    expires_at: datetime | None
    revoked_at: datetime | None
    last_used_at: datetime | None
    created_at: datetime


class AgentTokenCreatedOut(AgentTokenOut):
    token: str


class AgentToolCallAuditIn(BaseModel):
    tool_name: str = Field(min_length=1, max_length=80)
    ok: bool
    error_detail: str | None = Field(default=None, max_length=120)
    latency_ms: int = Field(default=0, ge=0)
    request_meta: dict = Field(default_factory=dict)
