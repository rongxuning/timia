"""Pydantic schemas for the web (browser) auth flow.

The RT lives in an HttpOnly cookie set by the response, so request bodies
rarely need to carry it. Login and refresh responses return an access token,
its TTL, and the public session id (used by the client for the "where am I
logged in" UI).
"""

import uuid
from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


class WebLoginRequest(BaseModel):
    email: EmailStr
    password: str


class WebRefreshRequest(BaseModel):
    request_id: str = Field(min_length=16, max_length=64)


class WebTokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int  # seconds
    session_id: uuid.UUID
    refresh_token_expires_at: datetime


class WebSessionOut(BaseModel):
    id: uuid.UUID
    login_provider: str
    created_at: datetime
    last_used_at: datetime
    idle_expires_at: datetime
    absolute_expires_at: datetime
    last_ip: str | None
    last_user_agent: str | None
    is_current: bool
