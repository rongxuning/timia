"""Pure-function tests for item location name + coordinate invariants."""

import pytest
from fastapi import HTTPException

from app.services.item_api import LocationValue, resolve_item_location


EMPTY = LocationValue(location=None, location_lat=None, location_lng=None)
PINNED = LocationValue(location="星巴克", location_lat=39.9836, location_lng=116.3168)


def _resolve(current: LocationValue, fields: dict) -> LocationValue:
    return resolve_item_location(
        current=current,
        location=fields.get("location"),
        location_lat=fields.get("location_lat"),
        location_lng=fields.get("location_lng"),
        fields_set=set(fields),
    )


def test_no_fields_keeps_current():
    assert _resolve(PINNED, {}) == PINNED


def test_name_only_create_has_no_coords():
    assert _resolve(EMPTY, {"location": "会议室 A"}) == LocationValue(
        location="会议室 A",
        location_lat=None,
        location_lng=None,
    )


def test_name_and_coords_write_together():
    assert _resolve(
        EMPTY,
        {"location": "星巴克", "location_lat": 39.9836, "location_lng": 116.3168},
    ) == PINNED


def test_rename_without_coords_keeps_coords():
    assert _resolve(PINNED, {"location": "咖啡馆"}) == LocationValue(
        location="咖啡馆",
        location_lat=39.9836,
        location_lng=116.3168,
    )


def test_explicit_null_location_clears_coords():
    assert _resolve(PINNED, {"location": None}) == EMPTY


def test_name_with_explicit_null_coords_clears_coords():
    assert _resolve(
        PINNED,
        {"location": "线上", "location_lat": None, "location_lng": None},
    ) == LocationValue(location="线上", location_lat=None, location_lng=None)


def test_coords_without_name_rejected():
    with pytest.raises(HTTPException) as exc:
        _resolve(EMPTY, {"location_lat": 39.9, "location_lng": 116.3})
    assert exc.value.status_code == 400
    assert exc.value.detail == "location_name_required"


def test_one_sided_coordinate_rejected():
    with pytest.raises(HTTPException) as exc:
        _resolve(EMPTY, {"location": "店", "location_lat": 39.9})
    assert exc.value.status_code == 400
    assert exc.value.detail == "invalid_location_coordinates"


def test_out_of_range_rejected():
    with pytest.raises(HTTPException) as exc:
        _resolve(
            EMPTY,
            {"location": "店", "location_lat": 91, "location_lng": 0},
        )
    assert exc.value.status_code == 400
    assert exc.value.detail == "invalid_location_coordinates"


def test_location_too_long():
    with pytest.raises(HTTPException) as exc:
        _resolve(EMPTY, {"location": "x" * 501})
    assert exc.value.status_code == 400
    assert exc.value.detail == "location_too_long"


def test_coords_only_when_name_already_exists():
    current = LocationValue(location="店", location_lat=None, location_lng=None)
    assert _resolve(current, {"location_lat": 1.0, "location_lng": 2.0}) == LocationValue(
        location="店",
        location_lat=1.0,
        location_lng=2.0,
    )
