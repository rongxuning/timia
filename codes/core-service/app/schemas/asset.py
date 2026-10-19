from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator

from app.services.assets_math import (
    CURRENCIES,
    EXPENSE_GROUPS,
    MAX_MINOR,
    categories_for,
)

AssetKind = Literal["asset", "liability"]
ExpenseGroup = Literal["fixed", "daily", "emergency", "other"]


def _clean(value: str | None) -> str | None:
    if value is None:
        return None
    text = value.strip()
    return text or None


def _currency(value: str) -> str:
    code = value.strip().upper()
    if code not in CURRENCIES:
        raise ValueError("unsupported_currency")
    return code


def _reason(value: str) -> str:
    text = value.strip()
    if not text:
        raise ValueError("reason_required")
    return text


class AssetHoldingCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    kind: AssetKind
    category: str
    currency: str
    amount_minor: int = Field(ge=0, le=MAX_MINOR)
    institution: str | None = Field(default=None, max_length=80)
    note: str | None = Field(default=None, max_length=500)
    include_in_net_worth: bool = True
    reason: str = Field(min_length=1, max_length=200)
    recorded_at: datetime | None = None

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        text = value.strip()
        if not text:
            raise ValueError("name_required")
        return text

    @field_validator("currency")
    @classmethod
    def currency_code(cls, value: str) -> str:
        return _currency(value)

    @field_validator("reason")
    @classmethod
    def strip_reason(cls, value: str) -> str:
        return _reason(value)

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
    institution: str | None = Field(default=None, max_length=80)
    note: str | None = Field(default=None, max_length=500)
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


class AssetAdjustmentCreate(BaseModel):
    version: int = Field(ge=1)
    amount_minor: int = Field(ge=0, le=MAX_MINOR)
    reason: str = Field(min_length=1, max_length=200)
    recorded_at: datetime | None = None

    @field_validator("reason")
    @classmethod
    def strip_reason(cls, value: str) -> str:
        return _reason(value)


class AssetHoldingArchive(BaseModel):
    version: int = Field(ge=1)
    reason: str = Field(min_length=1, max_length=200)
    recorded_at: datetime | None = None

    @field_validator("reason")
    @classmethod
    def strip_reason(cls, value: str) -> str:
        return _reason(value)


class AssetProfileUpdate(BaseModel):
    version: int = Field(ge=0)
    display_currency: str | None = None

    @field_validator("display_currency")
    @classmethod
    def currency_code(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return _currency(value)


class AssetFxRateUpdate(BaseModel):
    currency: str
    cny_per_unit: Decimal = Field(gt=0, max_digits=20, decimal_places=8)

    @field_validator("currency")
    @classmethod
    def currency_code(cls, value: str) -> str:
        code = _currency(value)
        if code == "CNY":
            raise ValueError("cny_rate_fixed")
        return code


class AssetExpenseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    group_kind: ExpenseGroup
    currency: str
    amount_minor: int = Field(ge=0, le=MAX_MINOR)
    reason: str = Field(min_length=1, max_length=200)
    recorded_at: datetime | None = None

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str) -> str:
        text = value.strip()
        if not text:
            raise ValueError("name_required")
        return text

    @field_validator("currency")
    @classmethod
    def currency_code(cls, value: str) -> str:
        return _currency(value)

    @field_validator("reason")
    @classmethod
    def strip_reason(cls, value: str) -> str:
        return _reason(value)

    @model_validator(mode="after")
    def group_known(self) -> AssetExpenseCreate:
        if self.group_kind not in EXPENSE_GROUPS:
            raise ValueError("invalid_expense_group")
        return self


class AssetExpenseUpdate(BaseModel):
    version: int = Field(ge=1)
    name: str | None = Field(default=None, max_length=80)

    @field_validator("name")
    @classmethod
    def strip_name(cls, value: str | None) -> str | None:
        if value is None:
            return None
        text = value.strip()
        if not text:
            raise ValueError("name_required")
        return text


class AssetExpenseAdjust(BaseModel):
    version: int = Field(ge=1)
    amount_minor: int = Field(ge=0, le=MAX_MINOR)
    reason: str = Field(min_length=1, max_length=200)
    recorded_at: datetime | None = None

    @field_validator("reason")
    @classmethod
    def strip_reason(cls, value: str) -> str:
        return _reason(value)


class AssetExpenseArchive(BaseModel):
    version: int = Field(ge=1)
    reason: str = Field(min_length=1, max_length=200)

    @field_validator("reason")
    @classmethod
    def strip_reason(cls, value: str) -> str:
        return _reason(value)


class AssetAdjustmentOut(BaseModel):
    id: str
    amount_minor: int
    delta_minor: int
    reason: str
    recorded_at: datetime


class AssetHoldingOut(BaseModel):
    id: str
    name: str
    kind: AssetKind
    category: str
    currency: str
    amount_minor: int
    institution: str | None
    note: str | None
    adjusted_at: datetime
    include_in_net_worth: bool
    needs_review: bool
    version: int
    latest_reason: str | None = None


class AssetHoldingDetailOut(AssetHoldingOut):
    adjustments: list[AssetAdjustmentOut] = Field(default_factory=list)


class AssetProfileOut(BaseModel):
    display_currency: str
    version: int


class AssetFxRateOut(BaseModel):
    currency: str
    cny_per_unit: str
    updated_at: datetime


class AssetExpenseOut(BaseModel):
    id: str
    group_kind: ExpenseGroup
    name: str
    currency: str
    amount_minor: int
    adjusted_at: datetime
    version: int
    latest_reason: str | None = None


class AssetExpenseDetailOut(AssetExpenseOut):
    adjustments: list[AssetAdjustmentOut] = Field(default_factory=list)
