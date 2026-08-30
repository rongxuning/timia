"""Unit tests for health card scores and Mifflin-St Jeor energy targets."""

from __future__ import annotations

from app.schemas.views.health import HealthCurrentOut
from app.services.health_scores import (
    _score_sleep,
    mifflin_st_jeor_bmr,
    score_current,
)


def test_mifflin_st_jeor_male_example():
    # 70 kg, 175 cm, 30 years
    bmr = mifflin_st_jeor_bmr(sex="male", age_years=30, height_cm=175, weight_kg=70)
    assert bmr is not None
    assert round(bmr) == 1649


def test_mifflin_st_jeor_female_example():
    bmr = mifflin_st_jeor_bmr(sex="female", age_years=30, height_cm=165, weight_kg=58)
    assert bmr is not None
    assert round(bmr) == 1300


def test_mifflin_requires_all_fields():
    assert mifflin_st_jeor_bmr(sex="male", age_years=30, height_cm=175, weight_kg=None) is None
    assert mifflin_st_jeor_bmr(sex=None, age_years=30, height_cm=175, weight_kg=70) is None


def test_score_current_without_profile_keeps_fixed_active_and_no_basal():
    current = HealthCurrentOut(active_energy_kcal=250, basal_energy_kcal=1600, body_mass_kg=70)
    scores, formulas, targets = score_current(current)
    assert scores["active"] == 50
    assert scores["basal"] is None
    assert targets is None
    assert "500" in formulas["active"].hint
    assert formulas["basal"].formula == "none"


def test_score_current_with_profile_uses_bmr_targets():
    current = HealthCurrentOut(active_energy_kcal=660, basal_energy_kcal=1649, body_mass_kg=70)
    scores, formulas, targets = score_current(
        current, sex="male", age_years=30, height_cm=175
    )
    assert targets is not None
    assert round(targets[0]) == 1649
    assert scores["basal"] == 100
    assert scores["active"] == 100
    assert "Mifflin" in formulas["basal"].hint
    assert "40%" in formulas["active"].hint


def test_score_sleep_peak_and_shoulders():
    assert _score_sleep(8 * 60) == 100
    assert _score_sleep(7 * 60) == 100
    assert _score_sleep(9 * 60) == 100
    assert _score_sleep(3.5 * 60) == 50
    assert _score_sleep(378) == 90
    assert _score_sleep(10 * 60) == 80
    assert _score_sleep(11 * 60) == 60
