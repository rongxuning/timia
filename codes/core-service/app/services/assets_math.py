"""Personal balance-sheet math.

净资产 = 计入的资产 − 计入的负债.

可动用净资产只算现金、投资、应收，并扣掉高息短期、分期和其他应付。
房产、耐用实物和房贷留在净资产里，不放进可动用净资产。
应急金只看现金相对每月必要开支的倍数。
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta

ASSET_KIND = "asset"
LIABILITY_KIND = "liability"
KINDS = frozenset({ASSET_KIND, LIABILITY_KIND})

ASSET_CATEGORY_ORDER = (
    "cash",
    "investment",
    "property",
    "durable",
    "receivable",
    "other_asset",
)
LIABILITY_CATEGORY_ORDER = (
    "credit",
    "installment",
    "mortgage",
    "payable",
    "other_liability",
)
ASSET_CATEGORIES = frozenset(ASSET_CATEGORY_ORDER)
LIABILITY_CATEGORIES = frozenset(LIABILITY_CATEGORY_ORDER)

# Spendable capital. Property and durables stay on the balance sheet only.
LIQUID_ASSET_CATEGORIES = frozenset({"cash", "investment", "receivable"})
# Debts without a matching illiquid asset in the liquid figure.
SHORT_DEBT_CATEGORIES = frozenset({"credit", "installment", "payable"})

CURRENCIES = {"CNY": 2, "USD": 2, "HKD": 2, "EUR": 2, "GBP": 2, "JPY": 0}
# Stay inside the JavaScript safe integer range.
MAX_MINOR = 9_007_199_254_740_991
AS_OF_MIN = date(1970, 1, 1)
REVIEW_AFTER_DAYS = 35
SERIES_LIMIT = 48


def categories_for(kind: str) -> frozenset[str]:
    if kind == ASSET_KIND:
        return ASSET_CATEGORIES
    if kind == LIABILITY_KIND:
        return LIABILITY_CATEGORIES
    return frozenset()


def category_sort_key(kind: str, category: str) -> tuple[int, int, str]:
    order = ASSET_CATEGORY_ORDER if kind == ASSET_KIND else LIABILITY_CATEGORY_ORDER
    try:
        index = order.index(category)
    except ValueError:
        index = len(order)
    return (0 if kind == ASSET_KIND else 1, index, category)


@dataclass(frozen=True)
class BookHolding:
    holding_id: str
    kind: str
    category: str
    amount_minor: int
    include_in_net_worth: bool
    as_of: date
    archived: bool = False


@dataclass(frozen=True)
class BookValuation:
    holding_id: str
    amount_minor: int
    as_of: date
    recorded_at: datetime


@dataclass(frozen=True)
class AllocationSlice:
    kind: str
    category: str
    amount_minor: int
    share: float


@dataclass(frozen=True)
class AssetsSummary:
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


@dataclass(frozen=True)
class NetWorthPoint:
    as_of: date
    net_worth_minor: int


def needs_review(as_of: date, today: date) -> bool:
    return as_of < today - timedelta(days=REVIEW_AFTER_DAYS)


def as_of_error(as_of: date, today: date) -> str | None:
    if as_of < AS_OF_MIN:
        return "as_of_too_old"
    if as_of > today + timedelta(days=1):
        return "as_of_in_future"
    return None


def _active(holding: BookHolding) -> bool:
    return not holding.archived and holding.include_in_net_worth


def emergency_band(months: float | None) -> str:
    if months is None:
        return "unset"
    if months < 1:
        return "thin"
    if months < 3:
        return "building"
    if months <= 6:
        return "adequate"
    if months <= 12:
        return "comfortable"
    return "excess"


def debt_band(liabilities: int, ratio: float | None) -> str:
    if liabilities <= 0:
        return "none"
    if ratio is None or ratio > 0.5:
        return "high"
    if ratio < 0.3:
        return "low"
    return "moderate"


def _focus(
    *,
    holding_count: int,
    high_interest_debt_minor: int,
    emergency: str,
) -> str:
    if holding_count == 0:
        return "start"
    if high_interest_debt_minor > 0:
        return "high_interest"
    if emergency in {"thin", "building"}:
        return "emergency"
    if emergency == "unset":
        return "set_essential"
    if emergency == "excess":
        return "excess_cash"
    return "balanced"


def summarize(
    holdings: list[BookHolding],
    *,
    monthly_essential_minor: int | None,
    today: date,
) -> tuple[AssetsSummary, list[AllocationSlice]]:
    active = [row for row in holdings if not row.archived]
    included = [row for row in active if row.include_in_net_worth]

    def total(kind: str, categories: frozenset[str] | None = None) -> int:
        amount = 0
        for row in included:
            if row.kind != kind:
                continue
            if categories is not None and row.category not in categories:
                continue
            amount += row.amount_minor
        return amount

    assets = total(ASSET_KIND)
    liabilities = total(LIABILITY_KIND)
    cash = total(ASSET_KIND, frozenset({"cash"}))
    investment = total(ASSET_KIND, frozenset({"investment"}))
    high_interest = total(LIABILITY_KIND, frozenset({"credit"}))
    liquid_assets = total(ASSET_KIND, LIQUID_ASSET_CATEGORIES)
    short_debt = total(LIABILITY_KIND, SHORT_DEBT_CATEGORIES)
    ratio = round(liabilities / assets, 4) if assets > 0 else None
    months = (
        round(cash / monthly_essential_minor, 2)
        if monthly_essential_minor is not None and monthly_essential_minor > 0
        else None
    )
    band = emergency_band(months)
    latest = max((row.as_of for row in active), default=None)
    summary = AssetsSummary(
        total_assets_minor=assets,
        total_liabilities_minor=liabilities,
        net_worth_minor=assets - liabilities,
        liquid_net_worth_minor=liquid_assets - short_debt,
        cash_minor=cash,
        investment_minor=investment,
        high_interest_debt_minor=high_interest,
        debt_ratio=ratio,
        emergency_months=months,
        emergency_band=band,
        debt_band=debt_band(liabilities, ratio),
        needs_review_count=sum(1 for row in active if needs_review(row.as_of, today)),
        focus=_focus(
            holding_count=len(active),
            high_interest_debt_minor=high_interest,
            emergency=band,
        ),
        holding_count=len(active),
        latest_as_of=latest,
    )
    return summary, _allocation(included)


def _allocation(included: list[BookHolding]) -> list[AllocationSlice]:
    buckets: dict[tuple[str, str], int] = {}
    side_totals = {ASSET_KIND: 0, LIABILITY_KIND: 0}
    for row in included:
        if row.amount_minor <= 0:
            continue
        key = (row.kind, row.category)
        buckets[key] = buckets.get(key, 0) + row.amount_minor
        side_totals[row.kind] = side_totals.get(row.kind, 0) + row.amount_minor
    slices: list[AllocationSlice] = []
    for key, amount in buckets.items():
        kind, category = key
        side = side_totals.get(kind, 0)
        share = round(amount / side, 4) if side else 0.0
        slices.append(AllocationSlice(kind=kind, category=category, amount_minor=amount, share=share))
    slices.sort(key=lambda row: category_sort_key(row.kind, row.category))
    return slices


def net_worth_series(
    holdings: list[BookHolding],
    valuations: list[BookValuation],
    *,
    limit: int = SERIES_LIMIT,
) -> list[NetWorthPoint]:
    """Replay current included holdings. Archived rows are left out of the line."""
    included = {
        row.holding_id: row
        for row in holdings
        if row.include_in_net_worth and not row.archived
    }
    by_holding: dict[str, list[BookValuation]] = {}
    for point in valuations:
        if point.holding_id not in included:
            continue
        by_holding.setdefault(point.holding_id, []).append(point)
    if not by_holding:
        return []
    for rows in by_holding.values():
        rows.sort(key=lambda row: (row.as_of, row.recorded_at))
    dates = sorted({point.as_of for rows in by_holding.values() for point in rows})
    cursor = {holding_id: 0 for holding_id in by_holding}
    latest: dict[str, int] = {}
    series: list[NetWorthPoint] = []
    for day in dates:
        for holding_id, rows in by_holding.items():
            index = cursor[holding_id]
            while index < len(rows) and rows[index].as_of <= day:
                latest[holding_id] = rows[index].amount_minor
                index += 1
            cursor[holding_id] = index
        net = 0
        for holding_id, amount in latest.items():
            kind = included[holding_id].kind
            net += amount if kind == ASSET_KIND else -amount
        series.append(NetWorthPoint(as_of=day, net_worth_minor=net))
    if limit > 0 and len(series) > limit:
        return series[-limit:]
    return series
