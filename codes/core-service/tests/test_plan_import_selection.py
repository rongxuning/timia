import os
from types import SimpleNamespace
from uuid import uuid4

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://timia:timia@localhost:5432/timia")
os.environ.setdefault("JWT_SECRET", "dev_secret_change_me")

from fastapi import HTTPException

from app.services.plan_apply import _slots_for_import


def _slot() -> SimpleNamespace:
    return SimpleNamespace(id=uuid4())


def test_slots_for_import_none_keeps_all():
    slots = [_slot(), _slot()]
    assert _slots_for_import(slots, None) == slots


def test_slots_for_import_filters_selected_order():
    first, second, third = _slot(), _slot(), _slot()
    selected = _slots_for_import([first, second, third], [third.id, first.id, third.id])
    assert selected == [third, first]


def test_slots_for_import_empty_selection():
    try:
        _slots_for_import([_slot()], [])
        raise AssertionError("expected empty_selection")
    except HTTPException as error:
        assert error.status_code == 400
        assert error.detail == "empty_selection"


def test_slots_for_import_unknown_id():
    slot = _slot()
    try:
        _slots_for_import([slot], [uuid4()])
        raise AssertionError("expected invalid_slot_ids")
    except HTTPException as error:
        assert error.status_code == 400
        assert error.detail == "invalid_slot_ids"
