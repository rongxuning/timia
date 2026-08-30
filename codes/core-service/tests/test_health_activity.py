"""Workout type remap and 0–99 score helpers."""

from __future__ import annotations

from app.models.health_types import normalize_activity_type, normalize_card_order
from app.schemas.views.health import HealthCurrentOut
from app.services.health_scores import score_current


def test_hiit_raw_camel_case_remaps_from_other():
    assert (
        normalize_activity_type("other", "highIntensityIntervalTraining") == "hiit"
    )


def test_hiit_raw_value_remaps():
    assert normalize_activity_type("other", "HKWorkoutActivityType(rawValue: 63)") == "hiit"


def test_known_token_is_kept():
    assert normalize_activity_type("running", None) == "running"


def test_unknown_falls_back_to_other():
    assert normalize_activity_type("not_a_sport", "nope") == "other"


def test_card_order_fills_missing_and_drops_unknown():
    assert normalize_card_order(["sleep", "bogus", "steps"])[0:2] == ["sleep", "steps"]
    assert set(normalize_card_order(["sleep"])) == set(normalize_card_order(None))


def test_score_none_when_missing():
    scores, _, _ = score_current(HealthCurrentOut())
    assert scores["steps"] is None
    assert scores["weight"] is None
    assert scores["basal"] is None


def test_score_linear_and_sleep_peak():
    scores, _, _ = score_current(
        HealthCurrentOut(
            steps=10000,
            active_energy_kcal=250,
            exercise_minutes=15,
            stand_hours=12,
            sleep_asleep_minutes=8 * 60,
            resting_hr_bpm=58,
            hrv_median_ms=60,
            vo2_max=50,
            cardio_recovery_bpm=30,
            spo2_avg=0.98,
        )
    )
    assert scores["steps"] == 100
    assert scores["active"] == 50
    assert scores["exercise"] == 50
    assert scores["stand"] == 100
    assert scores["sleep"] == 100
    assert scores["rhr"] == 100
    assert scores["hrv"] == 100
    assert scores["vo2"] == 100
    assert scores["recovery"] == 100
    assert scores["spo2"] == 100
    assert scores["weight"] is None
