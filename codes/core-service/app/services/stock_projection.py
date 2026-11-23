"""Project stock-account ledgers onto the personal assets homepage book.

Stock positions, cash, and transfers live in `asset_stock_*`. The homepage
read model only knew about `asset_holdings`, so broker cards stayed at zero.
These helpers turn each stock account's flow snapshot into synthetic book
lines and adjustments the existing summary/series math can consume.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.asset import (
    AssetAccount,
    AssetStockCash,
    AssetStockFrozen,
    AssetStockMark,
    AssetStockPosition,
    AssetStockTransfer,
)
from app.schemas.views.assets import AssetHoldingViewOut
from app.services.assets_math import BookAdjustment, BookLine, convert_minor
from app.services.stock_flow import (
    MAX_RANGE_DAYS,
    CashSet,
    PositionMark,
    Transfer,
    flow_series,
    snapshot_on,
)

STOCK_LINE_PREFIX = "stock-net:"
_UTC = ZoneInfo("UTC")


@dataclass(frozen=True)
class StockBookProjection:
    holdings: tuple[AssetHoldingViewOut, ...]
    lines: tuple[BookLine, ...]
    adjustments: tuple[BookAdjustment, ...]
    change_ats: tuple[datetime, ...]
    account_ids: frozenset[str]
    fx_incomplete: bool


def project_stock_accounts(
    db: Session,
    user_id: uuid.UUID,
    accounts: list[AssetAccount],
    *,
    display_currency: str,
    rates: dict[str, Decimal],
    today: date,
) -> StockBookProjection:
    """Build synthetic holdings/lines/adjustments for every active stock account.

    Totals stay in the display currency (same partial sums as the stock detail
    page). `fx_incomplete` is true when any currency could not be converted;
    callers should OR that into the page summary instead of clearing
    `display_minor`, so cards/summary/series stay consistent.
    """
    stock_accounts = [row for row in accounts if row.account_kind == "stock"]
    empty = StockBookProjection((), (), (), (), frozenset(), False)
    if not stock_accounts:
        return empty

    def convert(amount: int, currency: str) -> int | None:
        return convert_minor(amount, currency, display_currency, rates)

    holdings: list[AssetHoldingViewOut] = []
    lines: list[BookLine] = []
    adjustments: list[BookAdjustment] = []
    change_ats: list[datetime] = []
    projected_ids: set[str] = set()
    fx_incomplete = False

    ledgers = _load_ledgers(db, user_id, stock_accounts)
    for account in stock_accounts:
        ledger = ledgers.get(account.id)
        if ledger is None:
            continue
        marks, cash_sets, frozen_sets, transfers, event_ats = ledger
        if not marks and not cash_sets and not frozen_sets and not transfers:
            continue
        first_day = min(_utc_date(moment) for moment in event_ats)
        if first_day > today:
            continue
        if (today - first_day).days > MAX_RANGE_DAYS:
            first_day = today - timedelta(days=MAX_RANGE_DAYS)
        shot = snapshot_on(
            today, marks, cash_sets, transfers, convert, _UTC, frozen_sets=frozen_sets
        )
        line_id = f"{STOCK_LINE_PREFIX}{account.id}"
        adjusted_at = max(event_ats)
        fx_incomplete = fx_incomplete or shot.fx_incomplete
        holding = AssetHoldingViewOut(
            id=line_id,
            code=account.code,
            account_id=str(account.id),
            name=account.name,
            kind="asset",
            category="a_share",
            currency=display_currency,
            amount_minor=shot.total_assets_minor,
            institution=None,
            note=None,
            adjusted_at=adjusted_at,
            include_in_net_worth=True,
            needs_review=False,
            version=1,
            latest_reason=None,
            display_minor=shot.total_assets_minor,
            fx_missing=shot.fx_incomplete,
        )
        holdings.append(holding)
        lines.append(
            BookLine(
                line_id=line_id,
                kind="asset",
                category="a_share",
                currency=display_currency,
                amount_minor=shot.total_assets_minor,
                display_minor=shot.total_assets_minor,
                include_in_net_worth=True,
                adjusted_at=adjusted_at,
            )
        )
        projected_ids.add(str(account.id))
        series = flow_series(
            first_day,
            today,
            marks,
            cash_sets,
            transfers,
            convert,
            _UTC,
            frozen_sets=frozen_sets,
        )
        for point in series:
            adjustments.append(
                BookAdjustment(
                    holding_id=line_id,
                    amount_minor=point.net_assets_minor,
                    currency=display_currency,
                    recorded_at=datetime.combine(point.as_of, time.max, tzinfo=timezone.utc),
                )
            )
        change_ats.extend(event_ats)

    change_ats.sort()
    return StockBookProjection(
        holdings=tuple(holdings),
        lines=tuple(lines),
        adjustments=tuple(adjustments),
        change_ats=tuple(change_ats),
        account_ids=frozenset(projected_ids),
        fx_incomplete=fx_incomplete,
    )


def _load_ledgers(
    db: Session,
    user_id: uuid.UUID,
    accounts: list[AssetAccount],
) -> dict[
    uuid.UUID,
    tuple[list[PositionMark], list[CashSet], list[CashSet], list[Transfer], list[datetime]],
]:
    account_ids = [row.id for row in accounts]
    positions = list(
        db.scalars(
            select(AssetStockPosition).where(
                AssetStockPosition.owner_user_id == user_id,
                AssetStockPosition.account_id.in_(account_ids),
                AssetStockPosition.archived_at.is_(None),
            )
        ).all()
    )
    by_account_positions: dict[uuid.UUID, list[AssetStockPosition]] = {}
    for row in positions:
        by_account_positions.setdefault(row.account_id, []).append(row)
    position_ids = [row.id for row in positions]
    marks_by_position: dict[uuid.UUID, list[AssetStockMark]] = {}
    if position_ids:
        for row in db.scalars(
            select(AssetStockMark).where(AssetStockMark.position_id.in_(position_ids))
        ).all():
            marks_by_position.setdefault(row.position_id, []).append(row)
    cash_by_account: dict[uuid.UUID, list[AssetStockCash]] = {}
    for row in db.scalars(
        select(AssetStockCash).where(
            AssetStockCash.owner_user_id == user_id,
            AssetStockCash.account_id.in_(account_ids),
        )
    ).all():
        cash_by_account.setdefault(row.account_id, []).append(row)
    frozen_by_account: dict[uuid.UUID, list[AssetStockFrozen]] = {}
    for row in db.scalars(
        select(AssetStockFrozen).where(
            AssetStockFrozen.owner_user_id == user_id,
            AssetStockFrozen.account_id.in_(account_ids),
        )
    ).all():
        frozen_by_account.setdefault(row.account_id, []).append(row)
    transfer_by_account: dict[uuid.UUID, list[AssetStockTransfer]] = {}
    for row in db.scalars(
        select(AssetStockTransfer).where(
            AssetStockTransfer.owner_user_id == user_id,
            AssetStockTransfer.account_id.in_(account_ids),
        )
    ).all():
        transfer_by_account.setdefault(row.account_id, []).append(row)

    result: dict[
        uuid.UUID,
        tuple[list[PositionMark], list[CashSet], list[CashSet], list[Transfer], list[datetime]],
    ] = {}
    for account in accounts:
        pos_rows = by_account_positions.get(account.id, [])
        by_id = {row.id: row for row in pos_rows}
        marks: list[PositionMark] = []
        event_ats: list[datetime] = []
        for position in pos_rows:
            for row in marks_by_position.get(position.id, []):
                marks.append(
                    PositionMark(
                        position_id=str(row.position_id),
                        symbol=by_id[row.position_id].symbol,
                        name=by_id[row.position_id].name,
                        currency=by_id[row.position_id].currency,
                        at=row.recorded_at,
                        shares=row.shares,
                        cost_price_minor=row.cost_price_minor,
                        market_price_minor=row.market_price_minor,
                        seq=row.created_at,
                        tie=str(row.id),
                    )
                )
                event_ats.append(row.recorded_at)
        cash_sets = [
            CashSet(
                at=row.recorded_at,
                currency=row.currency,
                amount_minor=row.amount_minor,
                seq=row.created_at,
                tie=str(row.id),
            )
            for row in cash_by_account.get(account.id, [])
        ]
        event_ats.extend(row.recorded_at for row in cash_by_account.get(account.id, []))
        frozen_sets = [
            CashSet(
                at=row.recorded_at,
                currency=row.currency,
                amount_minor=row.amount_minor,
                seq=row.created_at,
                tie=str(row.id),
            )
            for row in frozen_by_account.get(account.id, [])
        ]
        event_ats.extend(row.recorded_at for row in frozen_by_account.get(account.id, []))
        transfers = [
            Transfer(
                at=row.recorded_at,
                currency=row.currency,
                direction=row.direction,  # type: ignore[arg-type]
                amount_minor=row.amount_minor,
                seq=row.created_at,
                tie=str(row.id),
            )
            for row in transfer_by_account.get(account.id, [])
        ]
        event_ats.extend(row.recorded_at for row in transfer_by_account.get(account.id, []))
        result[account.id] = (marks, cash_sets, frozen_sets, transfers, event_ats)
    return result


def _utc_date(moment: datetime) -> date:
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(timezone.utc).date()
