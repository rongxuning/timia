"""Balance-sheet identities for the personal asset ledger."""

from datetime import date, datetime, timezone

import pytest
from pydantic import ValidationError

from app.models.asset import AssetHolding
from app.schemas.asset import AssetHoldingCreate, AssetProfileUpdate
from app.services.assets_math import (
    ASSET_CATEGORIES,
    LIABILITY_CATEGORIES,
    BookHolding,
    BookValuation,
    needs_review,
    net_worth_series,
    summarize,
)

TODAY = date(2026, 10, 18)


def _holding(
    holding_id: str,
    *,
    kind: str,
    category: str,
    amount: int,
    as_of: date = TODAY,
    include: bool = True,
) -> BookHolding:
    return BookHolding(
        holding_id=holding_id,
        kind=kind,
        category=category,
        amount_minor=amount,
        include_in_net_worth=include,
        as_of=as_of,
    )


def test_net_worth_splits_spendable_money_from_the_house():
    summary, allocation = summarize(
        [
            _holding("cash", kind="asset", category="cash", amount=300_00),
            _holding("home", kind="asset", category="property", amount=1_000_000_00),
            _holding("card", kind="liability", category="credit", amount=100_00),
            _holding("loan", kind="liability", category="mortgage", amount=800_000_00),
        ],
        monthly_essential_minor=100_00,
        today=TODAY,
    )
    assert summary.total_assets_minor == 1_000_300_00
    assert summary.total_liabilities_minor == 800_100_00
    assert summary.net_worth_minor == 200_200_00
    assert summary.liquid_net_worth_minor == 200_00
    assert summary.high_interest_debt_minor == 100_00
    assert summary.emergency_months == 3.0
    assert summary.emergency_band == "adequate"
    assert summary.debt_band == "high"
    assert summary.focus == "high_interest"
    assert {item.category for item in allocation} == {"cash", "property", "credit", "mortgage"}


def test_excluded_property_drops_out_of_net_worth():
    summary, _allocation = summarize(
        [
            _holding("cash", kind="asset", category="cash", amount=100),
            _holding("home", kind="asset", category="property", amount=1000, include=False),
        ],
        monthly_essential_minor=None,
        today=TODAY,
    )
    assert summary.net_worth_minor == 100
    assert summary.liquid_net_worth_minor == 100
    assert summary.focus == "set_essential"


def test_emergency_and_excess_cash_focus():
    thin, _ = summarize(
        [_holding("cash", kind="asset", category="cash", amount=100)],
        monthly_essential_minor=200,
        today=TODAY,
    )
    assert thin.emergency_band == "thin"
    assert thin.focus == "emergency"

    excess, _ = summarize(
        [_holding("cash", kind="asset", category="cash", amount=1300)],
        monthly_essential_minor=100,
        today=TODAY,
    )
    assert excess.emergency_band == "excess"
    assert excess.focus == "excess_cash"


def test_empty_book_asks_to_start():
    summary, allocation = summarize([], monthly_essential_minor=100, today=TODAY)
    assert summary.focus == "start"
    assert summary.net_worth_minor == 0
    assert allocation == []


def test_review_window_is_strictly_older_than_35_days():
    assert needs_review(date(2026, 9, 13), TODAY) is False
    assert needs_review(date(2026, 9, 12), TODAY) is True
    summary, _ = summarize(
        [_holding("cash", kind="asset", category="cash", amount=1, as_of=date(2026, 9, 12))],
        monthly_essential_minor=1,
        today=TODAY,
    )
    assert summary.needs_review_count == 1


def test_series_replays_each_stocktake_date():
    holdings = [
        _holding("cash", kind="asset", category="cash", amount=200),
        _holding("card", kind="liability", category="credit", amount=50),
    ]
    series = net_worth_series(
        holdings,
        [
            BookValuation("cash", 100, date(2026, 1, 1), datetime(2026, 1, 1, tzinfo=timezone.utc)),
            BookValuation("cash", 200, date(2026, 2, 1), datetime(2026, 2, 1, tzinfo=timezone.utc)),
            BookValuation("card", 50, date(2026, 2, 1), datetime(2026, 2, 1, tzinfo=timezone.utc)),
        ],
    )
    assert [(point.as_of, point.net_worth_minor) for point in series] == [
        (date(2026, 1, 1), 100),
        (date(2026, 2, 1), 150),
    ]


def test_later_valuation_on_the_same_day_wins():
    holdings = [_holding("cash", kind="asset", category="cash", amount=30)]
    series = net_worth_series(
        holdings,
        [
            BookValuation("cash", 10, date(2026, 1, 1), datetime(2026, 1, 1, 8, tzinfo=timezone.utc)),
            BookValuation("cash", 30, date(2026, 1, 1), datetime(2026, 1, 1, 9, tzinfo=timezone.utc)),
        ],
    )
    assert series[-1].net_worth_minor == 30


def test_model_categories_match_the_ledger_math():
    constraint = next(
        item
        for item in AssetHolding.__table__.constraints
        if getattr(item, "name", None) == "ck_asset_holdings_category"
    )
    sql = str(constraint.sqltext)
    for code in ASSET_CATEGORIES | LIABILITY_CATEGORIES:
        assert f"'{code}'" in sql


def test_schema_rejects_a_category_from_the_other_side():
    with pytest.raises(ValidationError):
        AssetHoldingCreate(
            name="信用卡",
            kind="liability",
            category="cash",
            amount_minor=1,
            as_of=TODAY,
        )


def test_schema_rejects_unknown_currency():
    with pytest.raises(ValidationError):
        AssetProfileUpdate(version=0, currency="btc")
