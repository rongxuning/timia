"""Display-currency conversion and the household balance sheet."""

from datetime import date, datetime, timezone
from decimal import Decimal

from app.models.asset import AssetHolding
from app.services.asset_book import ACCOUNT_CATEGORIES
from app.services.assets_math import (
    ASSET_CATEGORIES,
    LIABILITY_CATEGORIES,
    BookAdjustment,
    BookLine,
    ExpenseLine,
    convert_minor,
    coverage_months,
    daily_balance_series,
    net_worth_series,
    summarize_expenses,
    summarize_holdings,
)

TODAY = date(2026, 10, 19)
NOW = datetime(2026, 10, 19, 8, tzinfo=timezone.utc)
RATES = {"HKD": Decimal("0.92"), "JPY": Decimal("0.048"), "KRW": Decimal("0.0052")}


def _line(
    line_id: str,
    *,
    kind: str,
    category: str,
    currency: str,
    amount: int,
    display: int | None,
    include: bool = True,
) -> BookLine:
    return BookLine(
        line_id=line_id,
        kind=kind,
        category=category,
        currency=currency,
        amount_minor=amount,
        display_minor=display,
        include_in_net_worth=include,
        adjusted_at=NOW,
    )


def test_hkd_and_jpy_convert_into_cny_minor_units():
    assert convert_minor(1_000_000, "HKD", "CNY", RATES) == 920_000
    assert convert_minor(1_000, "JPY", "CNY", RATES) == 4_800
    assert convert_minor(20_000_00, "CNY", "CNY", RATES) == 20_000_00
    assert convert_minor(1_000, "JPY", "CNY", {}) is None
    assert convert_minor(0, "JPY", "CNY", {}) == 0


def test_display_currency_other_than_cny_uses_the_cny_bridge():
    # 9,200.00 CNY / 0.92 = 10,000.00 HKD
    assert convert_minor(920_000, "CNY", "HKD", RATES) == 1_000_000


def test_sheet_keeps_restricted_balances_out_of_spendable_cash():
    summary, groups = summarize_holdings(
        [
            _line("bank", kind="asset", category="bank_deposit", currency="CNY", amount=20_000_00, display=20_000_00),
            _line("hk", kind="asset", category="hk_share", currency="HKD", amount=1_000_000, display=920_000),
            _line("fund", kind="asset", category="housing_fund", currency="CNY", amount=50_000_00, display=50_000_00),
            _line("card", kind="liability", category="credit_card", currency="CNY", amount=3_000_00, display=3_000_00),
            _line("jpy", kind="asset", category="fx", currency="JPY", amount=1_000, display=None),
        ],
        today=TODAY,
    )
    assert summary.total_assets_minor == 20_000_00 + 920_000 + 50_000_00
    assert summary.net_worth_minor == summary.total_assets_minor - 3_000_00
    assert summary.spendable_net_worth_minor == 20_000_00 + 920_000 - 3_000_00
    assert summary.emergency_cash_minor == 20_000_00
    assert summary.restricted_minor == 50_000_00
    assert summary.credit_minor == 3_000_00
    assert summary.fx_incomplete is True
    assert summary.missing_currencies == ("JPY",)
    assert summary.focus == "missing_fx"
    assert {row.category for row in groups} == {"bank_deposit", "hk_share", "housing_fund", "credit_card", "fx"}


def test_credit_is_called_out_once_rates_exist():
    summary, _groups = summarize_holdings(
        [
            _line("bank", kind="asset", category="bank_deposit", currency="CNY", amount=100, display=100),
            _line("card", kind="liability", category="credit_card", currency="CNY", amount=40, display=40),
        ],
        today=TODAY,
    )
    assert summary.focus == "credit"
    assert summary.net_worth_minor == 60


def test_expenses_split_the_reserve_from_the_monthly_run_rate():
    summary = summarize_expenses(
        [
            ExpenseLine("rent", "fixed", "CNY", 3_000_00, 3_000_00),
            ExpenseLine("food", "daily", "CNY", 2_000_00, 2_000_00),
            ExpenseLine("reserve", "emergency", "CNY", 10_000_00, 10_000_00),
            ExpenseLine("misc", "other", "CNY", 500_00, 500_00),
        ]
    )
    assert summary.monthly_running_minor == 5_500_00
    assert summary.emergency_minor == 10_000_00
    assert summary.spending_total_minor == 15_500_00
    assert coverage_months(20_000_00, summary.monthly_running_minor) == 3.64


def test_daily_series_carries_each_day_through_today():
    lines = [
        _line("cash", kind="asset", category="bank_deposit", currency="CNY", amount=200, display=200),
        _line("card", kind="liability", category="credit_card", currency="CNY", amount=50, display=50),
    ]
    series = daily_balance_series(
        lines,
        [
            BookAdjustment("cash", 100, "CNY", datetime(2026, 2, 1, tzinfo=timezone.utc)),
            BookAdjustment("cash", 200, "CNY", datetime(2026, 2, 3, tzinfo=timezone.utc)),
            BookAdjustment("card", 50, "CNY", datetime(2026, 2, 3, tzinfo=timezone.utc)),
        ],
        display_currency="CNY",
        rates={},
        today=date(2026, 2, 4),
    )
    by_day = {point.as_of: point for point in series}
    assert by_day[date(2026, 2, 1)].assets_minor == 100
    assert by_day[date(2026, 2, 1)].liabilities_minor == 0
    assert by_day[date(2026, 2, 2)].net_worth_minor == 100
    assert by_day[date(2026, 2, 3)].assets_minor == 200
    assert by_day[date(2026, 2, 3)].liabilities_minor == 50
    assert by_day[date(2026, 2, 3)].net_worth_minor == 150
    assert by_day[date(2026, 2, 4)].net_worth_minor == 150
    assert series[0].as_of == date(2026, 2, 1)
    assert series[-1].as_of == date(2026, 2, 4)


def test_series_replays_actual_balances_at_the_current_rate():
    lines = [
        _line("hk", kind="asset", category="hk_share", currency="HKD", amount=2_000_000, display=1_840_000),
    ]
    series = net_worth_series(
        lines,
        [
            BookAdjustment("hk", 1_000_000, "HKD", datetime(2026, 1, 1, tzinfo=timezone.utc)),
            BookAdjustment("hk", 2_000_000, "HKD", datetime(2026, 2, 1, tzinfo=timezone.utc)),
        ],
        display_currency="CNY",
        rates=RATES,
    )
    assert [(point.as_of, point.net_worth_minor) for point in series] == [
        (date(2026, 1, 1), 920_000),
        (date(2026, 2, 1), 1_840_000),
    ]


def test_model_categories_match_the_ledger_math():
    constraint = next(
        item
        for item in AssetHolding.__table__.constraints
        if getattr(item, "name", None) == "ck_asset_holdings_category"
    )
    sql = str(constraint.sqltext)
    for code in ASSET_CATEGORIES | LIABILITY_CATEGORIES:
        assert f"'{code}'" in sql


def test_a_share_does_not_belong_on_a_debit_card():
    assert "a_share" not in ACCOUNT_CATEGORIES["debit_card"]
    assert "bank_deposit" in ACCOUNT_CATEGORIES["debit_card"]
    assert ACCOUNT_CATEGORIES["securities"] >= {"a_share", "hk_share"}
