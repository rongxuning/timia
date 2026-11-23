from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, Field


class StockAccountOut(BaseModel):
    id: str
    name: str
    code: str
    account_number: str | None = None


class StockFlowOut(BaseModel):
    display_currency: str
    fx_incomplete: bool
    net_assets_minor: int
    total_cost_minor: int
    total_assets_minor: int
    market_value_minor: int
    cash_minor: int
    frozen_minor: int
    liability_minor: int
    show_liability: bool
    gain_minor: int
    show_gain: bool
    bank_to_securities_minor: int
    securities_to_bank_minor: int


class StockPositionOut(BaseModel):
    id: str
    symbol: str
    name: str
    market: Literal["a_share", "hk_share"]
    currency: str
    shares: int
    cost_price_minor: int
    market_price_minor: int
    market_value_minor: int | None
    total_pnl_minor: int | None
    period_pnl_minor: int | None
    fx_missing: bool
    version: int
    current_shares: int
    current_cost_price_minor: int
    current_market_price_minor: int
    recorded_at: datetime


class StockSeriesPositionOut(BaseModel):
    id: str
    name: str
    shares: int
    cost_price_minor: int
    market_value_minor: int | None
    total_pnl_minor: int | None
    period_pnl_minor: int | None


class StockSeriesPointOut(BaseModel):
    as_of: date
    net_assets_minor: int
    total_cost_minor: int
    market_value_minor: int
    cash_minor: int
    frozen_minor: int
    liability_minor: int
    gain_minor: int
    positions: list[StockSeriesPositionOut] = Field(default_factory=list)


class StockDetailOut(BaseModel):
    account: StockAccountOut
    flow: StockFlowOut
    positions: list[StockPositionOut] = Field(default_factory=list)
    series: list[StockSeriesPointOut] = Field(default_factory=list)
