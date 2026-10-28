import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field


class MobileChallengeRequest(BaseModel):
    installation_id: str = Field(min_length=16, max_length=64)
    purpose: Literal["register", "login", "exchange", "oauth"]


class MobileRefreshChallengeRequest(BaseModel):
    installation_id: str = Field(min_length=16, max_length=64)
    session_id: uuid.UUID


class MobileChallengeOut(BaseModel):
    challenge_id: uuid.UUID
    nonce: str
    expires_at: datetime


class MobileDeviceRegisterRequest(BaseModel):
    installation_id: str = Field(min_length=16, max_length=64)
    challenge_id: uuid.UUID
    nonce: str = Field(min_length=32, max_length=256)
    public_key: str = Field(min_length=80, max_length=256)
    signature: str = Field(min_length=64, max_length=256)
    device_name: str | None = Field(default=None, max_length=160)
    os_version: str | None = Field(default=None, max_length=64)
    app_version: str | None = Field(default=None, max_length=64)


class MobileDeviceOut(BaseModel):
    device_id: uuid.UUID
    installation_id: str


class MobilePasswordLoginRequest(BaseModel):
    email: EmailStr
    password: str
    installation_id: str = Field(min_length=16, max_length=64)
    challenge_id: uuid.UUID
    nonce: str = Field(min_length=32, max_length=256)
    signature: str = Field(min_length=64, max_length=256)


class PhoneCodeRequest(BaseModel):
    phone: str = Field(min_length=8, max_length=20)
    installation_id: str = Field(min_length=16, max_length=64)


class PhoneCodeOut(BaseModel):
    challenge_id: uuid.UUID
    nonce: str
    expires_at: datetime
    dev_code: str | None = None


class PhoneLoginRequest(BaseModel):
    phone: str = Field(min_length=8, max_length=20)
    code: str = Field(pattern=r"^\d{6}$")
    installation_id: str = Field(min_length=16, max_length=64)
    challenge_id: uuid.UUID
    nonce: str = Field(min_length=32, max_length=256)
    signature: str = Field(min_length=64, max_length=256)


class OAuthLoginRequest(BaseModel):
    installation_id: str = Field(min_length=16, max_length=64)
    challenge_id: uuid.UUID
    nonce: str = Field(min_length=32, max_length=256)
    signature: str = Field(min_length=64, max_length=256)
    id_token: str | None = Field(default=None, max_length=8192)
    code: str | None = Field(default=None, max_length=2048)
    redirect_uri: str | None = Field(default=None, max_length=512)
    code_verifier: str | None = Field(default=None, max_length=256)


class MobileTokenExchangeRequest(BaseModel):
    installation_id: str = Field(min_length=16, max_length=64)
    challenge_id: uuid.UUID
    nonce: str = Field(min_length=32, max_length=256)
    signature: str = Field(min_length=64, max_length=256)


class MobileRefreshRequest(BaseModel):
    session_id: uuid.UUID
    installation_id: str = Field(min_length=16, max_length=64)
    refresh_token: str = Field(min_length=32, max_length=256)
    request_id: str = Field(min_length=16, max_length=64)
    challenge_id: uuid.UUID
    nonce: str = Field(min_length=32, max_length=256)
    signature: str = Field(min_length=64, max_length=256)


class MobileTokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    refresh_token: str
    refresh_token_expires_at: datetime
    session_id: uuid.UUID


class MobileSessionOut(BaseModel):
    id: uuid.UUID
    installation_id: str
    device_name: str | None
    platform: str
    os_version: str | None
    app_version: str | None
    login_provider: str
    created_at: datetime
    last_used_at: datetime
    idle_expires_at: datetime
    absolute_expires_at: datetime
    is_current: bool
