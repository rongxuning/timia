"""Write DTOs for bank account products."""

from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, model_validator

from app.services.assets_math import MAX_MINOR

BankProductKind = Literal["savings", "investment", "credit"]


class BankProductCreate(BaseModel):
    name: str = Field(min_length=1, max_length=80)
    product_kind: BankProductKind
    currency: str = Field(default="CNY", min_length=3, max_length=3)
    # savings
    balance_minor: int | None = Field(default=None, ge=0, le=MAX_MINOR)
    # investment
    value_minor: int | None = Field(default=None, ge=0, le=MAX_MINOR)
    cost_minor: int | None = Field(default=None)
    # credit
    limit_minor: int | None = Field(default=None, ge=0, le=MAX_MINOR)
    statement_minor: int | None = Field(default=None, ge=0, le=MAX_MINOR)
    paid_off: bool | None = None
    reason: str = Field(min_length=1, max_length=200)
    recorded_at: datetime | None = None

    @model_validator(mode="after")
    def kind_fields(self) -> BankProductCreate:
        if self.product_kind == "savings":
            if self.balance_minor is None:
                raise ValueError("balance_required")
        elif self.product_kind == "investment":
            if self.value_minor is None or self.cost_minor is None:
                raise ValueError("investment_amounts_required")
            if abs(self.cost_minor) > MAX_MINOR:
                raise ValueError("amount_invalid")
        else:
            if self.limit_minor is None or self.statement_minor is None:
                raise ValueError("credit_amounts_required")
            if self.paid_off is None:
                self.paid_off = self.statement_minor == 0
        return self


class BankSavingsTxnCreate(BaseModel):
    version: int = Field(ge=1)
    balance_minor: int = Field(ge=0, le=MAX_MINOR)
    reason: str = Field(min_length=1, max_length=200)
    recorded_at: datetime | None = None
    timezone: str | None = Field(default=None, max_length=64)


class BankInvestmentOpCreate(BaseModel):
    version: int = Field(ge=1)
    value_minor: int = Field(ge=0, le=MAX_MINOR)
    cost_minor: int = Field()
    reason: str = Field(min_length=1, max_length=200)
    recorded_at: datetime | None = None
    timezone: str | None = Field(default=None, max_length=64)


class BankCreditBillCreate(BaseModel):
    version: int = Field(ge=1)
    year_month: str = Field(min_length=7, max_length=7)
    limit_minor: int = Field(ge=0, le=MAX_MINOR)
    statement_minor: int = Field(ge=0, le=MAX_MINOR)
    paid_off: bool
    reason: str = Field(min_length=1, max_length=200)
    recorded_at: datetime | None = None


class BankProductWriteOut(BaseModel):
    id: str
    name: str
    product_kind: BankProductKind
    currency: str
    balance_minor: int
    value_minor: int
    cost_minor: int
    limit_minor: int
    statement_minor: int
    paid_off: bool
    version: int
