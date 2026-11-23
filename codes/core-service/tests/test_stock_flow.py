"""Pure checks for the stock-account flow."""

from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

import pytest

from app.services.stock_flow import (
    CashSet,
    PositionMark,
    Transfer,
    flow_series,
    iter_days,
    period_pnl,
    series_period_pnl,
    snapshot_on,
)


def _at(day: str, hour: int = 8) -> datetime:
    year, month, dom = (int(part) for part in day.split("-"))
    return datetime(year, month, dom, hour, tzinfo=timezone.utc)


def _mark(day: str, *, shares: int, price: int, cost: int = 100, name: str = "茅台", symbol: str = "600519") -> PositionMark:
    return PositionMark(
        position_id=symbol,
        symbol=symbol,
        name=name,
        currency="CNY",
        at=_at(day),
        shares=shares,
        cost_price_minor=cost * 10,
        market_price_minor=price * 10,
    )


def _identity(amount: int, currency: str) -> int | None:
    if currency == "HKD":
        return None
    return amount


def test_snapshot_keeps_the_mark_time_in_effect_on_that_day():
    shot = snapshot_on(
        date(2026, 11, 20),
        marks=[
            _mark("2026-11-19", shares=10, price=10_000),
            _mark("2026-11-20", shares=12, price=11_000),
            _mark("2026-11-21", shares=99, price=99_000),
        ],
        cash_sets=[],
        transfers=[],
        convert=_identity,
        zone=ZoneInfo("Asia/Shanghai"),
    )
    assert len(shot.positions) == 1
    assert shot.positions[0].shares == 12
    assert shot.positions[0].recorded_at == _at("2026-11-20")


def test_gain_shows_when_cash_covers_cost_and_liability_stays_hidden():
    shot = snapshot_on(
        date(2026, 11, 21),
        marks=[_mark("2026-11-21", shares=200, price=210_000, cost=180_000)],
        cash_sets=[CashSet(at=_at("2026-11-03"), currency="CNY", amount_minor=8_000_000)],
        transfers=[
            Transfer(at=_at("2026-11-01", 1), currency="CNY", direction="bank_to_securities", amount_minor=8_800_000),
            Transfer(at=_at("2026-11-02"), currency="CNY", direction="securities_to_bank", amount_minor=1_800_000),
        ],
        convert=_identity,
    )
    # 200 * 2100.00 = 420,000.00; cash mark replaces the transfer balance.
    assert shot.market_value_minor == 42_000_000
    assert shot.cash_minor == 8_000_000
    assert shot.net_assets_minor == 50_000_000
    assert shot.total_assets_minor == shot.net_assets_minor
    assert shot.total_cost_minor == 7_000_000
    assert shot.show_liability is False
    assert shot.liability_minor == 43_000_000
    assert shot.show_gain is True
    assert shot.gain_minor == 1_000_000


def test_liability_shows_only_when_net_assets_are_below_cost():
    shot = snapshot_on(
        date(2026, 11, 21),
        marks=[_mark("2026-11-21", shares=10, price=10_000, cost=10_000)],
        cash_sets=[CashSet(at=_at("2026-11-01"), currency="CNY", amount_minor=100_000)],
        transfers=[
            Transfer(at=_at("2026-11-01"), currency="CNY", direction="bank_to_securities", amount_minor=7_000_000),
        ],
        convert=_identity,
    )
    assert shot.net_assets_minor == 200_000
    assert shot.total_cost_minor == 7_000_000
    assert shot.show_liability is True
    assert shot.liability_minor == 200_000 - 7_000_000
    assert shot.show_gain is False


def test_transfer_moves_cash_until_a_later_cash_mark():
    shot = snapshot_on(
        date(2026, 11, 3),
        marks=[],
        cash_sets=[],
        transfers=[
            Transfer(at=_at("2026-11-01"), currency="CNY", direction="bank_to_securities", amount_minor=500),
            Transfer(at=_at("2026-11-02"), currency="CNY", direction="securities_to_bank", amount_minor=200),
        ],
        convert=_identity,
    )
    assert shot.cash_minor == 300
    assert shot.total_cost_minor == 300
    later = snapshot_on(
        date(2026, 11, 5),
        marks=[],
        cash_sets=[CashSet(at=_at("2026-11-04"), currency="CNY", amount_minor=50)],
        transfers=[
            Transfer(at=_at("2026-11-01"), currency="CNY", direction="bank_to_securities", amount_minor=500),
            Transfer(at=_at("2026-11-06"), currency="CNY", direction="bank_to_securities", amount_minor=20),
        ],
        convert=_identity,
    )
    assert later.cash_minor == 50
    assert later.total_cost_minor == 500


def test_period_pnl_is_the_change_in_floating_profit():
    marks = [
        _mark("2026-11-03", shares=10, price=100, cost=80),
        _mark("2026-11-21", shares=10, price=130, cost=80),
    ]
    start = snapshot_on(date(2026, 11, 2), marks, [], [], _identity)
    end = snapshot_on(date(2026, 11, 21), marks, [], [], _identity)
    assert start.positions == ()
    assert end.positions[0].total_pnl_minor == 500
    assert period_pnl(end.positions[0], None) == 500
    opened = snapshot_on(date(2026, 11, 3), marks, [], [], _identity)
    assert period_pnl(end.positions[0], opened.positions[0]) == 300


def test_series_uses_the_mark_in_effect_that_day():
    points = flow_series(
        date(2026, 11, 3),
        date(2026, 11, 5),
        [_mark("2026-11-04", shares=2, price=50)],
        [],
        [],
        _identity,
    )
    # Event days only: one mark → one node (no daily fill).
    assert [point.as_of for point in points] == [date(2026, 11, 4)]
    assert [point.market_value_minor for point in points] == [100]
    assert points[0].positions[0].name == "茅台"
    assert points[0].positions[0].shares == 2
    assert points[0].positions[0].cost_price_minor == 1000
    assert points[0].positions[0].total_pnl_minor == -100
    assert series_period_pnl(-100, None, opened=False) == -100
    assert series_period_pnl(-100, -40, opened=True) == -60
    assert series_period_pnl(None, -40, opened=True) is None
    assert series_period_pnl(-100, None, opened=True) is None


def test_series_skips_weekends_and_keeps_weekday_events():
    # 2026-11-20 Fri, 21 Sat, 22 Sun, 23 Mon.
    points = flow_series(
        date(2026, 11, 20),
        date(2026, 11, 23),
        [
            _mark("2026-11-20", shares=2, price=50),
            _mark("2026-11-21", shares=3, price=60),
            _mark("2026-11-23", shares=4, price=70),
        ],
        [],
        [],
        _identity,
        ZoneInfo("UTC"),
    )
    assert [point.as_of for point in points] == [date(2026, 11, 20), date(2026, 11, 23)]
    assert [point.market_value_minor for point in points] == [100, 280]
    assert len(points[0].positions) == 1
    assert len(points[1].positions) == 1


def test_missing_fx_flags_the_snapshot_and_skips_that_value():
    shot = snapshot_on(
        date(2026, 11, 20),
        marks=[
            PositionMark(
                position_id="0700",
                symbol="00700",
                name="腾讯",
                currency="HKD",
                at=_at("2026-11-20"),
                shares=10,
                cost_price_minor=1000,
                market_price_minor=1200,
            )
        ],
        cash_sets=[],
        transfers=[],
        convert=_identity,
    )
    assert shot.fx_incomplete is True
    assert shot.market_value_minor == 0
    assert shot.positions[0].fx_missing is True
    assert shot.positions[0].total_pnl_minor is None
    assert shot.positions[0].market_value_minor is None
    points = flow_series(
        date(2026, 11, 20),
        date(2026, 11, 20),
        [
            PositionMark(
                position_id="0700",
                symbol="00700",
                name="腾讯",
                currency="HKD",
                at=_at("2026-11-20"),
                shares=10,
                cost_price_minor=1000,
                market_price_minor=1200,
            )
        ],
        [],
        [],
        _identity,
    )
    assert points[0].positions[0].market_value_minor is None
    assert points[0].positions[0].total_pnl_minor is None


def test_negative_cost_increases_floating_profit():
    shot = snapshot_on(
        date(2026, 11, 21),
        marks=[
            PositionMark(
                position_id="603083",
                symbol="603083",
                name="剑桥科技",
                currency="CNY",
                at=_at("2026-11-21"),
                shares=1500,
                cost_price_minor=-145_735,
                market_price_minor=94_030,
            )
        ],
        cash_sets=[],
        transfers=[],
        convert=_identity,
    )
    assert shot.market_value_minor == 14_104_500
    assert shot.positions[0].total_pnl_minor == 35_964_750


def test_range_rejects_an_inverted_or_huge_window():
    with pytest.raises(ValueError, match="range_invalid"):
        iter_days(date(2026, 11, 5), date(2026, 11, 3))
    with pytest.raises(ValueError, match="range_too_long"):
        iter_days(date(2020, 1, 1), date(2026, 1, 1))


def test_local_calendar_day_keeps_a_shanghai_morning_on_that_day():
    # 2026-11-21 00:30 in Shanghai is still 2026-11-20 in UTC.
    moment = datetime(2026, 11, 20, 16, 30, tzinfo=timezone.utc)
    marks = [
        PositionMark(
            position_id="600519",
            symbol="600519",
            name="茅台",
            currency="CNY",
            at=moment,
            shares=1,
            cost_price_minor=1000,
            market_price_minor=1000,
        )
    ]
    shanghai = ZoneInfo("Asia/Shanghai")
    on_local_day = snapshot_on(date(2026, 11, 21), marks, [], [], _identity, shanghai)
    previous_utc_day = snapshot_on(date(2026, 11, 20), marks, [], [], _identity, shanghai)
    assert on_local_day.market_value_minor == 100
    assert previous_utc_day.market_value_minor == 0


def test_tied_marks_keep_the_later_write():
    moment = _at("2026-11-21")
    earlier = _mark("2026-11-21", shares=1, price=10)
    later = PositionMark(
        position_id=earlier.position_id,
        symbol=earlier.symbol,
        name=earlier.name,
        currency="CNY",
        at=moment,
        shares=9,
        cost_price_minor=1000,
        market_price_minor=200,
        seq=moment.replace(minute=1),
        tie="b",
    )
    first = PositionMark(
        position_id=earlier.position_id,
        symbol=earlier.symbol,
        name=earlier.name,
        currency="CNY",
        at=moment,
        shares=1,
        cost_price_minor=1000,
        market_price_minor=100,
        seq=moment,
        tie="a",
    )
    shot = snapshot_on(date(2026, 11, 21), [first, later], [], [], _identity)
    assert shot.positions[0].shares == 9
    assert shot.market_value_minor == 180


def test_same_timestamp_cash_mark_wins_over_the_transfer():
    moment = _at("2026-11-01")
    shot = snapshot_on(
        date(2026, 11, 1),
        marks=[],
        cash_sets=[CashSet(at=moment, currency="CNY", amount_minor=80)],
        transfers=[Transfer(at=moment, currency="CNY", direction="bank_to_securities", amount_minor=500)],
        convert=_identity,
    )
    assert shot.cash_minor == 80
    assert shot.total_cost_minor == 500
    assert shot.show_gain is False
