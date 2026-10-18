from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.services.assets_math import CURRENCIES, MAX_MINOR, categories_for

AssetKind = Literal["asset", "liability"]


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    text = value.strip()
    return text or None


class AssetHoldingCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    kind: AssetKind
    category: str
    amount_minor: int = Field(ge=0, le=MAX_MINOR)
    institution: str | None = Field(default=None, max_length=80)
    note: str | None = Field(default=None, max_length=500)
    as_of: date
    include_in_net_worth: bool = True

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        text = value.strip()
        if not text:
            raise ValueError("name_required")
        return text

    @field_validator("institution", "note")
    @classmethod
    def strip_optional(cls, value: str | None) -> str | None:
        return _clean(value)

    @model_validator(mode="after")
    def category_matches_kind(self) -> AssetHoldingCreate:
        if self.category not in categories_for(self.kind):
            raise ValueError("category_kind_mismatch")
        return self


class AssetHoldingUpdate(BaseModel):
    version: int = Field(ge=1)
    name: str | None = Field(default=None, max_length=80)
    kind: AssetKind | None = None
    category: str | None = None
    amount_minor: int | None = Field(default=None, ge=0, le=MAX_MINOR)
    institution: str | None = Field(default=None, max_length=80)
    note: str | None = Field(default=None, max_length=500)
    as_of: date | None = None
    include_in_net_worth: bool | None = None

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        text = value.strip()
        if not text:
            raise ValueError("name_required")
        return text

    @field_validator("institution", "note")
    @classmethod
    def strip_optional(cls, value: str | None) -> str | None:
        return _clean(value)


class AssetHoldingConfirm(BaseModel):
    version: int = Field(ge=1)
    as_of: date


class AssetHoldingArchive(BaseModel):
    version: int = Field(ge=1)


class AssetProfileUpdate(BaseModel):
    version: int = Field(ge=0)
    currency: str | None = None
    monthly_essential_minor: int | None = Field(default=None, ge=0, le=MAX_MINOR)

    @field_validator("currency")
    @classmethod
    def currency_code(cls, value: str | None) -> str | None:
        if value is None:
            return None
        code = value.strip().upper()
        if code not in CURRENCIES:
            raise ValueError("unsupported_currency")
        return code


class AssetHoldingOut(BaseModel):
    id: str
    name: str
    kind: AssetKind
    category: str
    amount_minor: int
    institution: str | None
    note: str | None
    as_of: date
    include_in_net_worth: bool
    needs_review: bool
    version: int


class AssetProfileOut(BaseModel):
    currency: str
    monthly_essential_minor: int | None
    version: int
    currency_locked: bool
