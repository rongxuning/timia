from datetime import date

from app.services.views.stock_detail import card_as_of


def test_cards_follow_today_when_marks_are_older():
    today = date(2026, 11, 21)
    assert card_as_of(today, [date(2026, 11, 13)]) == today


def test_cards_follow_a_mark_dated_after_today():
    today = date(2026, 11, 21)
    assert card_as_of(today, [date(2026, 11, 18), date(2026, 11, 25)]) == date(2026, 11, 25)
