from __future__ import annotations

from datetime import date
from typing import Literal

from pydantic import BaseModel, Field

from app.schemas.asset import AssetHoldingOut, AssetProfileOut


class AllocationSliceOut(BaseModel):
    kind: Literal["asset", "liability"]
    category: str
    amount_minor: int
    share: float


class NetWorthPointOut(BaseModel):
    as_of: date
    net_worth_minor: int


class AssetsSummaryOut(BaseModel):
    total_assets_minor: int
    total_liabilities_minor: int
    net_worth_minor: int
    liquid_net_worth_minor: int
    cash_minor: int
    investment_minor: int
    high_interest_debt_minor: int
    debt_ratio: float | None
    emergency_months: float | None
    emergency_band: str
    debt_band: str
    needs_review_count: int
    focus: str
    holding_count: int
    latest_as_of: date | None


class MyAssetsViewOut(BaseModel):
    profile: AssetProfileOut
    summary: AssetsSummaryOut
    holdings: list[AssetHoldingOut] = Field(default_factory=list)
    allocation: list[AllocationSliceOut] = Field(default_factory=list)
    net_worth_series: list[NetWorthPointOut] = Field(default_factory=list)
