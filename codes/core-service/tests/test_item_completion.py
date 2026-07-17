from datetime import datetime, timezone

from app.services.item_api import resolve_item_completed_at


NOW = datetime(2026, 7, 17, 10, 30, tzinfo=timezone.utc)
EARLIER = datetime(2026, 7, 16, 9, 0, tzinfo=timezone.utc)


def test_transition_to_done_sets_current_time():
    assert resolve_item_completed_at(
        current_status="doing",
        current_completed_at=None,
        next_status="done",
        now=NOW,
    ) == NOW


def test_transition_to_done_accepts_user_edited_time():
    assert resolve_item_completed_at(
        current_status="doing",
        current_completed_at=None,
        next_status="done",
        requested_completed_at=EARLIER,
        completed_at_was_set=True,
        now=NOW,
    ) == EARLIER


def test_done_completion_time_can_be_edited():
    assert resolve_item_completed_at(
        current_status="done",
        current_completed_at=NOW,
        next_status="done",
        requested_completed_at=EARLIER,
        completed_at_was_set=True,
    ) == EARLIER


def test_leaving_done_clears_completion_time():
    assert resolve_item_completed_at(
        current_status="done",
        current_completed_at=NOW,
        next_status="doing",
    ) is None


def test_existing_done_time_is_preserved_when_not_explicitly_updated():
    assert resolve_item_completed_at(
        current_status="done",
        current_completed_at=EARLIER,
        next_status="done",
        now=NOW,
    ) == EARLIER
