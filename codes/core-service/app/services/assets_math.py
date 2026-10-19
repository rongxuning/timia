"""Personal balance sheet with a display currency.

每笔记账用自己的实际币种。汇总先换成人民币，再换成显示币种。
汇率的含义是：1 个货币单位等于多少人民币。人民币汇率恒为 1。

净资产 = 计入的资产 − 计入的负债（都按显示币种）。
可动用净资产 = 储蓄、钱包、股票、外汇、黄金 − 信用卡。
公积金和医保只进净资产。
应急现金只算储蓄和钱包。应急备用是支出里单独的一档，不计入每月常规支出。
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP

ASSET_KIND = "asset"
LIABILITY_KIND = "liability"

ASSET_CATEGORY_ORDER = (
    "a_share",
    "hk_share",
    "bank_deposit",
    "wallet",
    "housing_fund",
    "medical",
    "fx",
    "gold",
    "other_asset",
)
LIABILITY_CATEGORY_ORDER = (
    "credit_card",
    "other_liability",
)
ASSET_CATEGORIES = frozenset(ASSET_CATEGORY_ORDER)
LIABILITY_CATEGORIES = frozenset(LIABILITY_CATEGORY_ORDER)

EMERGENCY_CASH_CATEGORIES = frozenset({"bank_deposit", "wallet"})
SPENDABLE_ASSET_CATEGORIES = frozenset(
    {"bank_deposit", "wallet", "a_share", "hk_share", "fx", "gold"}
)
RESTRICTED_CATEGORIES = frozenset({"housing_fund", "medical"})
INVESTMENT_CATEGORIES = frozenset({"a_share", "hk_share"})

EXPENSE_GROUP_ORDER = ("fixed", "daily", "emergency", "other")
EXPENSE_GROUPS = frozenset(EXPENSE_GROUP_ORDER)
MONTHLY_EXPENSE_GROUPS = frozenset({"fixed", "daily", "other"})

CURRENCIES = {
    "CNY": 2,
    "HKD": 2,
    "JPY": 0,
    "KRW": 0,
    "USD": 2,
    "EUR": 2,
    "GBP": 2,
}
BASE_CURRENCY = "CNY"
MAX_MINOR = 9_007_199_254_740_991
REVIEW_AFTER_DAYS = 35
SERIES_LIMIT = 48
DAILY_SERIES_LIMIT = 1200
RECORDED_AT_MIN = datetime(1970, 1, 1, tzinfo=timezone.utc)


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


def currency_digits(currency: str) -> int:
    return CURRENCIES[currency]


def rate_to_cny(currency: str, rates: dict[str, Decimal]) -> Decimal | None:
    if currency == BASE_CURRENCY:
        return Decimal(1)
    return rates.get(currency)


def convert_minor(
    amount_minor: int,
    currency: str,
    display_currency: str,
    rates: dict[str, Decimal],
) -> int | None:
    """Convert a minor-unit amount into the display currency's minor units."""
    if currency not in CURRENCIES or display_currency not in CURRENCIES:
        return None
    if amount_minor == 0 or currency == display_currency:
        return amount_minor
    src = rate_to_cny(currency, rates)
    dst = rate_to_cny(display_currency, rates)
    if src is None or dst is None or dst == 0:
        return None
    major = Decimal(amount_minor) / (Decimal(10) ** currency_digits(currency))
    display_major = (major * src) / dst
    factor = Decimal(10) ** currency_digits(display_currency)
    minor = (display_major * factor).quantize(Decimal("1"), rounding=ROUND_HALF_UP)
    return int(minor)


def needs_review(adjusted_at: datetime, today: date) -> bool:
    moment = adjusted_at if adjusted_at.tzinfo else adjusted_at.replace(tzinfo=timezone.utc)
    return moment.astimezone(timezone.utc).date() < today - timedelta(days=REVIEW_AFTER_DAYS)


def recorded_at_error(moment: datetime, now: datetime) -> str | None:
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    if moment < RECORDED_AT_MIN:
        return "recorded_at_too_old"
    if moment > now + timedelta(days=1):
        return "recorded_at_in_future"
    return None


@dataclass(frozen=True)
class BookLine:
    line_id: str
    kind: str
    category: str
    currency: str
    amount_minor: int
    display_minor: int | None
    include_in_net_worth: bool
    adjusted_at: datetime
    archived: bool = False


@dataclass(frozen=True)
class ExpenseLine:
    item_id: str
    group: str
    currency: str
    amount_minor: int
    display_minor: int | None
    archived: bool = False


@dataclass(frozen=True)
class BookAdjustment:
    holding_id: str
    amount_minor: int
    currency: str
    recorded_at: datetime


@dataclass(frozen=True)
class HoldingGroupTotal:
    kind: str
    category: str
    display_minor: int
    fx_incomplete: bool


@dataclass(frozen=True)
class ExpenseGroupTotal:
    group: str
    display_minor: int
    fx_incomplete: bool


@dataclass(frozen=True)
class AssetsSummary:
    total_assets_minor: int
    total_liabilities_minor: int
    net_worth_minor: int
    spendable_net_worth_minor: int
    emergency_cash_minor: int
    credit_minor: int
    investment_minor: int
    restricted_minor: int
    fx_incomplete: bool
    missing_currencies: tuple[str, ...]
    holding_count: int
    needs_review_count: int
    latest_adjusted_at: datetime | None
    focus: str


@dataclass(frozen=True)
class ExpenseSummary:
    fixed_minor: int
    daily_minor: int
    emergency_minor: int
    other_minor: int
    monthly_running_minor: int
    spending_total_minor: int
    fx_incomplete: bool
    groups: tuple[ExpenseGroupTotal, ...]


@dataclass(frozen=True)
class NetWorthPoint:
    as_of: date
    net_worth_minor: int


@dataclass(frozen=True)
class DailyBalancePoint:
    as_of: date
    assets_minor: int
    liabilities_minor: int
    net_worth_minor: int


def _active(line: BookLine) -> bool:
    return not line.archived and line.include_in_net_worth and line.display_minor is not None


def summarize_holdings(lines: list[BookLine], *, today: date) -> tuple[AssetsSummary, list[HoldingGroupTotal]]:
    active = [line for line in lines if not line.archived]
    included = [line for line in active if line.include_in_net_worth]
    missing = tuple(
        sorted({line.currency for line in included if line.display_minor is None and line.amount_minor != 0})
    )

    def total(kind: str, categories: frozenset[str] | None = None) -> int:
        amount = 0
        for line in included:
            if line.kind != kind or line.display_minor is None:
                continue
            if categories is not None and line.category not in categories:
                continue
            amount += line.display_minor
        return amount

    assets = total(ASSET_KIND)
    liabilities = total(LIABILITY_KIND)
    emergency_cash = total(ASSET_KIND, EMERGENCY_CASH_CATEGORIES)
    spendable_assets = total(ASSET_KIND, SPENDABLE_ASSET_CATEGORIES)
    credit = total(LIABILITY_KIND, frozenset({"credit_card"}))
    latest = max((line.adjusted_at for line in active), default=None)
    fx_incomplete = bool(missing)
    focus = _focus(
        holding_count=len(active),
        fx_incomplete=fx_incomplete,
        credit_minor=credit,
    )
    summary = AssetsSummary(
        total_assets_minor=assets,
        total_liabilities_minor=liabilities,
        net_worth_minor=assets - liabilities,
        spendable_net_worth_minor=spendable_assets - credit,
        emergency_cash_minor=emergency_cash,
        credit_minor=credit,
        investment_minor=total(ASSET_KIND, INVESTMENT_CATEGORIES),
        restricted_minor=total(ASSET_KIND, RESTRICTED_CATEGORIES),
        fx_incomplete=fx_incomplete,
        missing_currencies=missing,
        holding_count=len(active),
        needs_review_count=sum(1 for line in active if needs_review(line.adjusted_at, today)),
        latest_adjusted_at=latest,
        focus=focus,
    )
    return summary, _holding_groups(included)


def _focus(*, holding_count: int, fx_incomplete: bool, credit_minor: int) -> str:
    if holding_count == 0:
        return "start"
    if fx_incomplete:
        return "missing_fx"
    if credit_minor > 0:
        return "credit"
    return "balanced"


def _holding_groups(included: list[BookLine]) -> list[HoldingGroupTotal]:
    totals: dict[tuple[str, str], int] = {}
    incomplete: set[tuple[str, str]] = set()
    for line in included:
        key = (line.kind, line.category)
        if line.display_minor is None:
            if line.amount_minor != 0:
                incomplete.add(key)
            continue
        totals[key] = totals.get(key, 0) + line.display_minor
    keys = set(totals) | incomplete
    groups = [
        HoldingGroupTotal(
            kind=kind,
            category=category,
            display_minor=totals.get((kind, category), 0),
            fx_incomplete=(kind, category) in incomplete,
        )
        for kind, category in keys
    ]
    groups.sort(key=lambda row: category_sort_key(row.kind, row.category))
    return groups


def summarize_expenses(lines: list[ExpenseLine]) -> ExpenseSummary:
    active = [line for line in lines if not line.archived]
    buckets = {group: 0 for group in EXPENSE_GROUP_ORDER}
    incomplete: set[str] = set()
    for line in active:
        if line.group not in EXPENSE_GROUPS:
            continue
        if line.display_minor is None:
            if line.amount_minor != 0:
                incomplete.add(line.group)
            continue
        buckets[line.group] = buckets.get(line.group, 0) + line.display_minor
    monthly = sum(buckets[group] for group in MONTHLY_EXPENSE_GROUPS)
    groups = tuple(
        ExpenseGroupTotal(
            group=group,
            display_minor=buckets[group],
            fx_incomplete=group in incomplete,
        )
        for group in EXPENSE_GROUP_ORDER
        if buckets[group] or group in incomplete
    )
    return ExpenseSummary(
        fixed_minor=buckets["fixed"],
        daily_minor=buckets["daily"],
        emergency_minor=buckets["emergency"],
        other_minor=buckets["other"],
        monthly_running_minor=monthly,
        spending_total_minor=monthly + buckets["emergency"],
        fx_incomplete=bool(incomplete),
        groups=groups,
    )


def coverage_months(emergency_cash_minor: int, monthly_running_minor: int) -> float | None:
    if monthly_running_minor <= 0:
        return None
    return round(emergency_cash_minor / monthly_running_minor, 2)


def net_worth_series(
    lines: list[BookLine],
    adjustments: list[BookAdjustment],
    *,
    display_currency: str,
    rates: dict[str, Decimal],
    limit: int = SERIES_LIMIT,
) -> list[NetWorthPoint]:
    """Replay included holdings and convert each point with the current rates."""
    included = {
        line.line_id: line for line in lines if line.include_in_net_worth and not line.archived
    }
    by_holding: dict[str, list[BookAdjustment]] = {}
    for point in adjustments:
        if point.holding_id not in included:
            continue
        by_holding.setdefault(point.holding_id, []).append(point)
    if not by_holding:
        return []
    for rows in by_holding.values():
        rows.sort(key=lambda row: row.recorded_at)
    dates = sorted(
        {
            _utc_date(point.recorded_at)
            for rows in by_holding.values()
            for point in rows
        }
    )
    cursor = {holding_id: 0 for holding_id in by_holding}
    latest: dict[str, int] = {}
    series: list[NetWorthPoint] = []
    for day in dates:
        for holding_id, rows in by_holding.items():
            index = cursor[holding_id]
            while index < len(rows) and _utc_date(rows[index].recorded_at) <= day:
                latest[holding_id] = rows[index].amount_minor
                index += 1
            cursor[holding_id] = index
        net = 0
        skipped = False
        for holding_id, amount in latest.items():
            line = included[holding_id]
            display = convert_minor(amount, line.currency, display_currency, rates)
            if display is None:
                skipped = True
                continue
            net += display if line.kind == ASSET_KIND else -display
        if skipped and not latest:
            continue
        series.append(NetWorthPoint(as_of=day, net_worth_minor=net))
    if limit > 0 and len(series) > limit:
        return series[-limit:]
    return series


def daily_balance_series(
    lines: list[BookLine],
    adjustments: list[BookAdjustment],
    *,
    display_currency: str,
    rates: dict[str, Decimal],
    today: date,
    limit: int = DAILY_SERIES_LIMIT,
) -> list[DailyBalancePoint]:
    """End-of-day assets, liabilities, and net worth, filled through today."""
    included = {
        line.line_id: line for line in lines if line.include_in_net_worth and not line.archived
    }
    by_holding: dict[str, list[BookAdjustment]] = {}
    for point in adjustments:
        if point.holding_id not in included:
            continue
        by_holding.setdefault(point.holding_id, []).append(point)
    if not by_holding:
        return [DailyBalancePoint(today, 0, 0, 0)]
    for rows in by_holding.values():
        rows.sort(key=lambda row: row.recorded_at)
    event_days = sorted(
        {_utc_date(point.recorded_at) for rows in by_holding.values() for point in rows}
    )
    cursor = {holding_id: 0 for holding_id in by_holding}
    latest: dict[str, int] = {}
    events: dict[date, tuple[int, int]] = {}
    for day in event_days:
        for holding_id, rows in by_holding.items():
            index = cursor[holding_id]
            while index < len(rows) and _utc_date(rows[index].recorded_at) <= day:
                latest[holding_id] = rows[index].amount_minor
                index += 1
            cursor[holding_id] = index
        assets, liabilities = _split_totals(latest, included, display_currency, rates)
        events[day] = (assets, liabilities)
    first = event_days[0]
    end = today if today >= first else first
    start = first
    if (end - start).days + 1 > limit:
        start = end - timedelta(days=limit - 1)
    series: list[DailyBalancePoint] = []
    carried = (0, 0)
    day = start
    while day <= end:
        if day in events:
            carried = events[day]
        assets, liabilities = carried
        series.append(
            DailyBalancePoint(
                as_of=day,
                assets_minor=assets,
                liabilities_minor=liabilities,
                net_worth_minor=assets - liabilities,
            )
        )
        day += timedelta(days=1)
    return series


def _split_totals(
    latest: dict[str, int],
    included: dict[str, BookLine],
    display_currency: str,
    rates: dict[str, Decimal],
) -> tuple[int, int]:
    assets = 0
    liabilities = 0
    for holding_id, amount in latest.items():
        line = included[holding_id]
        display = convert_minor(amount, line.currency, display_currency, rates)
        if display is None:
            continue
        if line.kind == ASSET_KIND:
            assets += display
        else:
            liabilities += display
    return assets, liabilities


def _utc_date(moment: datetime) -> date:
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(timezone.utc).date()
    if moment.tzinfo is None:
        moment = moment.replace(tzinfo=timezone.utc)
    return moment.astimezone(timezone.utc).date()
