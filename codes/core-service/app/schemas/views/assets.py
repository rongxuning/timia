from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.asset import AssetExpenseOut, AssetFxRateOut, AssetHoldingOut, AssetProfileOut


class HoldingGroupOut(BaseModel):
    kind: Literal["asset", "liability"]
    category: str
    display_minor: int
    fx_incomplete: bool
    holdings: list[AssetHoldingViewOut] = Field(default_factory=list)


class AssetHoldingViewOut(AssetHoldingOut):
    display_minor: int | None = None
    fx_missing: bool = False


class ExpenseGroupOut(BaseModel):
    group_kind: Literal["fixed", "daily", "emergency", "other"]
    display_minor: int
    fx_incomplete: bool
    items: list[AssetExpenseViewOut] = Field(default_factory=list)


class AssetExpenseViewOut(AssetExpenseOut):
    display_minor: int | None = None
    fx_missing: bool = False


class AssetsSummaryOut(BaseModel):
    display_currency: str
    total_assets_minor: int
    total_liabilities_minor: int
    net_worth_minor: int
    spendable_net_worth_minor: int
    emergency_cash_minor: int
    credit_minor: int
    investment_minor: int
    restricted_minor: int
    monthly_running_minor: int
    emergency_reserve_minor: int
    spending_total_minor: int
    coverage_months: float | None
    fx_incomplete: bool
    missing_currencies: list[str] = Field(default_factory=list)
    holding_count: int
    needs_review_count: int
    latest_adjusted_at: datetime | None
    focus: str


class NetWorthPointOut(BaseModel):
    as_of: date
    net_worth_minor: int


class MyAssetsViewOut(BaseModel):
    profile: AssetProfileOut
    rates: list[AssetFxRateOut] = Field(default_factory=list)
    summary: AssetsSummaryOut
    groups: list[HoldingGroupOut] = Field(default_factory=list)
    expense_groups: list[ExpenseGroupOut] = Field(default_factory=list)
    net_worth_series: list[NetWorthPointOut] = Field(default_factory=list)


# Resolve forward references used in the group models above.
HoldingGroupOut.model_rebuild()
ExpenseGroupOut.model_rebuild()
