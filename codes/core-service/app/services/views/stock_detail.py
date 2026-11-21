"""Read model for one stock account over a date range."""

from __future__ import annotations

import uuid
from datetime import date, timedelta
from decimal import Decimal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.asset import (
    AssetStockCash,
    AssetStockMark,
    AssetStockPosition,
    AssetStockTransfer,
)
from app.models.user import User
from app.schemas.views.stock_detail import (
    StockAccountOut,
    StockDetailOut,
    StockFlowOut,
    StockPositionOut,
    StockSeriesPointOut,
    StockSeriesPositionOut,
)
from app.services.asset_api import list_rates, profile_out
from app.services.assets_math import convert_minor
from app.services.stock_book import _stock_account
from app.services.stock_flow import (
    CashSet,
    PositionMark,
    Transfer,
    flow_series,
    period_pnl,
    snapshot_on,
)


def build_stock_detail(
    db: Session,
    user: User,
    account_id: uuid.UUID,
    start: date,
    end: date,
) -> StockDetailOut:
    account = _stock_account(db, user.id, account_id)
    profile = profile_out(db, user)
    display = profile.display_currency
    rates = {row.currency: Decimal(row.cny_per_unit) for row in list_rates(db, user.id)}

    def convert(amount: int, currency: str) -> int | None:
        return convert_minor(amount, currency, display, rates)

    positions = list(
        db.scalars(
            select(AssetStockPosition).where(
                AssetStockPosition.account_id == account.id,
                AssetStockPosition.archived_at.is_(None),
            )
        ).all()
    )
    by_id = {row.id: row for row in positions}
    marks = [
        PositionMark(
            position_id=str(row.position_id),
            symbol=by_id[row.position_id].symbol,
            name=by_id[row.position_id].name,
            currency=by_id[row.position_id].currency,
            at=row.recorded_at,
            shares=row.shares,
            cost_price_minor=row.cost_price_minor,
            market_price_minor=row.market_price_minor,
        )
        for row in _marks(db, list(by_id))
    ]
    cash_sets = [
        CashSet(at=row.recorded_at, currency=row.currency, amount_minor=row.amount_minor)
        for row in _cash(db, account.id)
    ]
    transfers = [
        Transfer(
            at=row.recorded_at,
            currency=row.currency,
            direction=row.direction,  # type: ignore[arg-type]
            amount_minor=row.amount_minor,
        )
        for row in _transfers(db, account.id)
    ]
    try:
        series = flow_series(start, end, marks, cash_sets, transfers, convert)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    end_shot = snapshot_on(end, marks, cash_sets, transfers, convert)
    start_shot = snapshot_on(start - timedelta(days=1), marks, cash_sets, transfers, convert)
    start_by_id = {row.position_id: row for row in start_shot.positions}
    versions = {str(row.id): row.version for row in positions}
    cards = [
        StockPositionOut(
            id=row.position_id,
            symbol=row.symbol,
            name=row.name,
            market=by_id[uuid.UUID(row.position_id)].market,  # type: ignore[arg-type]
            currency=row.currency,
            shares=row.shares,
            cost_price_minor=row.cost_price_minor,
            market_price_minor=row.market_price_minor,
            market_value_minor=row.market_value_minor,
            total_pnl_minor=row.total_pnl_minor,
            period_pnl_minor=period_pnl(row, start_by_id.get(row.position_id)),
            fx_missing=row.fx_missing,
            version=versions[row.position_id],
        )
        for row in end_shot.positions
    ]
    return StockDetailOut(
        account=StockAccountOut(
            id=str(account.id),
            name=account.name,
            code=account.code,
            account_number=account.account_number,
        ),
        flow=StockFlowOut(
            display_currency=display,
            fx_incomplete=end_shot.fx_incomplete,
            net_assets_minor=end_shot.net_assets_minor,
            total_cost_minor=end_shot.total_cost_minor,
            total_assets_minor=end_shot.total_assets_minor,
            market_value_minor=end_shot.market_value_minor,
            cash_minor=end_shot.cash_minor,
            liability_minor=end_shot.liability_minor,
            show_liability=end_shot.show_liability,
            gain_minor=end_shot.gain_minor,
            show_gain=end_shot.show_gain,
            bank_to_securities_minor=end_shot.bank_to_securities_minor,
            securities_to_bank_minor=end_shot.securities_to_bank_minor,
        ),
        positions=cards,
        series=[
            StockSeriesPointOut(
                as_of=point.as_of,
                net_assets_minor=point.net_assets_minor,
                total_cost_minor=point.total_cost_minor,
                market_value_minor=point.market_value_minor,
                cash_minor=point.cash_minor,
                liability_minor=point.liability_minor,
                gain_minor=point.gain_minor,
                positions=[
                    StockSeriesPositionOut(
                        id=item.position_id,
                        name=item.name,
                        market_value_minor=item.market_value_minor,
                    )
                    for item in point.positions
                ],
            )
            for point in series
        ],
    )


def _marks(db: Session, position_ids: list[uuid.UUID]) -> list[AssetStockMark]:
    if not position_ids:
        return []
    return list(
        db.scalars(select(AssetStockMark).where(AssetStockMark.position_id.in_(position_ids))).all()
    )


def _cash(db: Session, account_id: uuid.UUID) -> list[AssetStockCash]:
    return list(
        db.scalars(select(AssetStockCash).where(AssetStockCash.account_id == account_id)).all()
    )


def _transfers(db: Session, account_id: uuid.UUID) -> list[AssetStockTransfer]:
    return list(
        db.scalars(
            select(AssetStockTransfer).where(AssetStockTransfer.account_id == account_id)
        ).all()
    )
