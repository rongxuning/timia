"""Stock-account flow at a calendar day, in the display currency.

净总资产 = 总市值 + 总现金。总资产与它相同。
总成本 = 银行转证券 − 证券转银行。
总负债 = 净总资产 − 总成本，只在小于 0 时展示。
总收益 = 总现金 − 总成本，只在大于等于 0 时展示。

A cash mark sets that currency's balance. A transfer then moves cash from
whatever balance is already there. At one timestamp, transfers apply first
and a cash mark replaces the balance afterwards.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from typing import Callable, Literal
from zoneinfo import ZoneInfo

from app.services.assets_math import currency_digits

Converter = Callable[[int, str], int | None]
MAX_RANGE_DAYS = 800
# Stock quotes keep three decimal places: 200.819 is stored as 200819.
QUOTE_SCALE = 1000
TransferDirection = Literal["bank_to_securities", "securities_to_bank"]


@dataclass(frozen=True)
class PositionMark:
    position_id: str
    symbol: str
    name: str
    currency: str
    at: datetime
    shares: int
    cost_price_minor: int
    market_price_minor: int
    seq: datetime | None = None
    tie: str = ""


@dataclass(frozen=True)
class CashSet:
    at: datetime
    currency: str
    amount_minor: int
    seq: datetime | None = None
    tie: str = ""


@dataclass(frozen=True)
class Transfer:
    at: datetime
    currency: str
    direction: TransferDirection
    amount_minor: int
    seq: datetime | None = None
    tie: str = ""


@dataclass(frozen=True)
class PositionSnap:
    position_id: str
    symbol: str
    name: str
    currency: str
    shares: int
    cost_price_minor: int
    market_price_minor: int
    recorded_at: datetime
    market_value_minor: int | None
    total_pnl_minor: int | None
    fx_missing: bool


@dataclass(frozen=True)
class FlowSnapshot:
    fx_incomplete: bool
    market_value_minor: int
    cash_minor: int
    net_assets_minor: int
    total_assets_minor: int
    bank_to_securities_minor: int
    securities_to_bank_minor: int
    total_cost_minor: int
    liability_minor: int
    show_liability: bool
    gain_minor: int
    show_gain: bool
    positions: tuple[PositionSnap, ...]


@dataclass(frozen=True)
class SeriesPosition:
    position_id: str
    name: str
    market_value_minor: int


@dataclass(frozen=True)
class FlowPoint:
    as_of: date
    net_assets_minor: int
    total_cost_minor: int
    market_value_minor: int
    cash_minor: int
    liability_minor: int
    gain_minor: int
    positions: tuple[SeriesPosition, ...]


def quote_value_minor(shares: int, quote_minor: int, currency: str) -> int:
    """Turn a share count and a 3-decimal quote into currency minor units."""
    digits = currency_digits(currency)
    product = Decimal(shares) * Decimal(quote_minor) * (Decimal(10) ** digits) / Decimal(QUOTE_SCALE)
    return int(product.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _utc(moment: datetime) -> datetime:
    if moment.tzinfo is None:
        return moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(timezone.utc)


def _on_or_before(moment: datetime, day: date, zone: ZoneInfo) -> bool:
    return _utc(moment).astimezone(zone).date() <= day


def _rank(at: datetime, seq: datetime | None, tie: str) -> tuple[datetime, datetime, str]:
    moment = _utc(at)
    return (moment, _utc(seq) if seq is not None else moment, tie)


def latest_marks(marks: list[PositionMark], day: date, zone: ZoneInfo | None = None) -> dict[str, PositionMark]:
    clock = zone or ZoneInfo("UTC")
    chosen: dict[str, PositionMark] = {}
    for mark in marks:
        if not _on_or_before(mark.at, day, clock):
            continue
        current = chosen.get(mark.position_id)
        if current is None or _rank(mark.at, mark.seq, mark.tie) >= _rank(current.at, current.seq, current.tie):
            chosen[mark.position_id] = mark
    return chosen


def _cash_balances(
    cash_sets: list[CashSet],
    transfers: list[Transfer],
    day: date,
    zone: ZoneInfo,
) -> dict[str, int]:
    events: list[tuple[datetime, int, datetime, str, str, str, int]] = []
    for row in transfers:
        if not _on_or_before(row.at, day, zone):
            continue
        signed = row.amount_minor if row.direction == "bank_to_securities" else -row.amount_minor
        at, seq, tie = _rank(row.at, row.seq, row.tie)
        events.append((at, 0, seq, tie, "move", row.currency, signed))
    for row in cash_sets:
        if _on_or_before(row.at, day, zone):
            at, seq, tie = _rank(row.at, row.seq, row.tie)
            events.append((at, 1, seq, tie, "set", row.currency, row.amount_minor))
    events.sort(key=lambda item: (item[0], item[1], item[2], item[3]))
    balances: dict[str, int] = {}
    for _at, _order, _seq, _tie, kind, currency, amount in events:
        if kind == "set":
            balances[currency] = amount
        else:
            balances[currency] = balances.get(currency, 0) + amount
    return balances


def _sum_converted(parts: list[tuple[int, str]], convert: Converter) -> tuple[int, bool]:
    total = 0
    missing = False
    for amount, currency in parts:
        display = convert(amount, currency)
        if display is None:
            missing = True
            continue
        total += display
    return total, missing


def snapshot_on(
    day: date,
    marks: list[PositionMark],
    cash_sets: list[CashSet],
    transfers: list[Transfer],
    convert: Converter,
    zone: ZoneInfo | None = None,
) -> FlowSnapshot:
    clock = zone or ZoneInfo("UTC")
    chosen = latest_marks(marks, day, clock)
    positions: list[PositionSnap] = []
    market_parts: list[tuple[int, str]] = []
    missing = False
    ordered = sorted(
        chosen.values(),
        key=lambda row: (-(row.shares * row.market_price_minor), row.name.casefold(), row.symbol),
    )
    for mark in ordered:
        native_market = quote_value_minor(mark.shares, mark.market_price_minor, mark.currency)
        native_cost = quote_value_minor(mark.shares, mark.cost_price_minor, mark.currency)
        market_display = convert(native_market, mark.currency)
        cost_display = convert(native_cost, mark.currency)
        fx_missing = market_display is None or cost_display is None
        missing = missing or fx_missing
        if market_display is not None:
            market_parts.append((native_market, mark.currency))
        pnl = None if fx_missing else market_display - cost_display
        positions.append(
            PositionSnap(
                position_id=mark.position_id,
                symbol=mark.symbol,
                name=mark.name,
                currency=mark.currency,
                shares=mark.shares,
                cost_price_minor=mark.cost_price_minor,
                market_price_minor=mark.market_price_minor,
                recorded_at=mark.at,
                market_value_minor=market_display,
                total_pnl_minor=pnl,
                fx_missing=fx_missing,
            )
        )
    market_value, market_missing = _sum_converted(market_parts, convert)
    balances = _cash_balances(cash_sets, transfers, day, clock)
    cash_parts = [(amount, currency) for currency, amount in balances.items()]
    cash, cash_missing = _sum_converted(cash_parts, convert)
    inbound: list[tuple[int, str]] = []
    outbound: list[tuple[int, str]] = []
    for row in transfers:
        if not _on_or_before(row.at, day, clock):
            continue
        bucket = inbound if row.direction == "bank_to_securities" else outbound
        bucket.append((row.amount_minor, row.currency))
    bank_in, in_missing = _sum_converted(inbound, convert)
    bank_out, out_missing = _sum_converted(outbound, convert)
    cost = bank_in - bank_out
    net = market_value + cash
    liability = net - cost
    gain = cash - cost
    return FlowSnapshot(
        fx_incomplete=missing or market_missing or cash_missing or in_missing or out_missing,
        market_value_minor=market_value,
        cash_minor=cash,
        net_assets_minor=net,
        total_assets_minor=net,
        bank_to_securities_minor=bank_in,
        securities_to_bank_minor=bank_out,
        total_cost_minor=cost,
        liability_minor=liability,
        show_liability=liability < 0,
        gain_minor=gain,
        show_gain=gain >= 0,
        positions=tuple(positions),
    )


def period_pnl(end: PositionSnap | None, start: PositionSnap | None) -> int | None:
    """Floating profit at the range end, minus floating profit just before the range."""
    if end is None or end.total_pnl_minor is None:
        return None
    if start is None:
        return end.total_pnl_minor
    if start.total_pnl_minor is None:
        return None
    return end.total_pnl_minor - start.total_pnl_minor


def iter_days(start: date, end: date) -> list[date]:
    span = (end - start).days
    if span < 0:
        raise ValueError("range_invalid")
    if span > MAX_RANGE_DAYS:
        raise ValueError("range_too_long")
    return [start + timedelta(days=offset) for offset in range(span + 1)]


def flow_series(
    start: date,
    end: date,
    marks: list[PositionMark],
    cash_sets: list[CashSet],
    transfers: list[Transfer],
    convert: Converter,
    zone: ZoneInfo | None = None,
) -> list[FlowPoint]:
    points: list[FlowPoint] = []
    for day in iter_days(start, end):
        shot = snapshot_on(day, marks, cash_sets, transfers, convert, zone)
        points.append(
            FlowPoint(
                as_of=day,
                net_assets_minor=shot.net_assets_minor,
                total_cost_minor=shot.total_cost_minor,
                market_value_minor=shot.market_value_minor,
                cash_minor=shot.cash_minor,
                liability_minor=shot.liability_minor,
                gain_minor=shot.gain_minor,
                positions=tuple(
                    SeriesPosition(
                        position_id=row.position_id,
                        name=row.name,
                        market_value_minor=row.market_value_minor or 0,
                    )
                    for row in shot.positions
                ),
            )
        )
    return points
