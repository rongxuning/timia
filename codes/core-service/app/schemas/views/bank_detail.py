"""Read model for one bank account over a date range."""

from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

BankProductKind = Literal["savings", "investment", "credit"]


class BankAccountOut(BaseModel):
    id: str
    name: str
    code: str
    account_kind: str
    account_number: str | None = None


class BankSummaryOut(BaseModel):
    display_currency: str
    fx_incomplete: bool
    total_assets_minor: int


class BankProductOut(BaseModel):
    id: str
    name: str
    product_kind: BankProductKind
    currency: str
    balance_minor: int
    value_minor: int
    cost_minor: int
    floating_pnl_minor: int | None
    limit_minor: int
    statement_minor: int
    paid_off: bool
    fx_missing: bool
    version: int
    recorded_at: datetime


class BankSeriesPointOut(BaseModel):
    as_of: date
    total_assets_minor: int


class BankProductSeriesPointOut(BaseModel):
    as_of: date
    # savings / credit statement / investment value
    primary_minor: int
    # investment cost; unused for others
    secondary_minor: int | None = None


class BankSavingsTxnOut(BaseModel):
    id: str
    balance_minor: int
    delta_minor: int
    reason: str
    recorded_at: datetime


class BankInvestmentOpOut(BaseModel):
    id: str
    value_minor: int
    cost_minor: int
    cost_delta_minor: int
    reason: str
    recorded_at: datetime


class BankCreditBillOut(BaseModel):
    id: str
    year_month: str
    limit_minor: int
    statement_minor: int
    paid_off: bool
    reason: str
    recorded_at: datetime


class BankProductDetailOut(BaseModel):
    product: BankProductOut
    series: list[BankProductSeriesPointOut] = Field(default_factory=list)
    savings_txns: list[BankSavingsTxnOut] = Field(default_factory=list)
    investment_ops: list[BankInvestmentOpOut] = Field(default_factory=list)
    credit_bills: list[BankCreditBillOut] = Field(default_factory=list)


class BankDetailOut(BaseModel):
    account: BankAccountOut
    summary: BankSummaryOut
    products: list[BankProductOut] = Field(default_factory=list)
    series: list[BankSeriesPointOut] = Field(default_factory=list)
    selected: BankProductDetailOut | None = None
