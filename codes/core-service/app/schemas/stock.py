from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class StockPositionCreate(BaseModel):
    symbol: str = Field(min_length=1, max_length=12)
    name: str = Field(min_length=1, max_length=80)
    market: Literal["a_share", "hk_share"]
    shares: int = Field(ge=1)
    cost_price_minor: int = Field(
        description="Cost per share in thousandths of the listing currency. May be negative.",
    )
    market_price_minor: int = Field(
        ge=0,
        description="Latest price per share in thousandths of the listing currency.",
    )
    reason: str = Field(min_length=1, max_length=200)
    recorded_at: datetime | None = None


class StockMarkCreate(BaseModel):
    version: int = Field(ge=1)
    shares: int = Field(ge=0)
    cost_price_minor: int = Field(
        description="Cost per share in thousandths of the listing currency. May be negative.",
    )
    market_price_minor: int = Field(ge=0)
    reason: str = Field(min_length=1, max_length=200)
    recorded_at: datetime | None = None


class StockCashCreate(BaseModel):
    currency: str = Field(min_length=3, max_length=3)
    amount_minor: int
    reason: str = Field(min_length=1, max_length=200)
    recorded_at: datetime | None = None


class StockTransferCreate(BaseModel):
    direction: Literal["bank_to_securities", "securities_to_bank"]
    currency: str = Field(min_length=3, max_length=3)
    amount_minor: int = Field(gt=0)
    reason: str = Field(min_length=1, max_length=200)
    recorded_at: datetime | None = None


class StockPositionWriteOut(BaseModel):
    id: str
    symbol: str
    name: str
    market: Literal["a_share", "hk_share"]
    currency: str
    shares: int
    cost_price_minor: int
    market_price_minor: int
    version: int
