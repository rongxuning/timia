from app.services.workout_metrics import (
    RUNNING_INDEX_FORMULA,
    TRAINING_LOAD_FORMULA,
    banister_trimp,
    downsample_series,
    estimate_power_w,
    haversine_m,
    hr_zones,
    km_splits,
    pace_zones,
    resolve_hr_max,
    running_index,
    running_rtss,
    tanaka_hr_max,
    zone_training_load,
)


def test_tanaka_and_resolve_hr_max():
    assert round(tanaka_hr_max(35), 1) == 183.5
    assert resolve_hr_max(profile_max=190, age_years=35) == 190
    assert resolve_hr_max(profile_max=None, age_years=35) == tanaka_hr_max(35)
    assert resolve_hr_max(profile_max=None, age_years=None) is None


def test_running_index_screenshot_order():
    value = running_index(
        activity_type="running",
        duration_seconds=35 * 60 + 8,
        distance_m=5010,
        avg_hr_bpm=161,
        hr_max=184,
    )
    assert value is not None
    assert 20 <= value <= 85
    assert 30 <= value <= 45


def test_running_index_rejects_short_or_walk():
    kwargs = dict(distance_m=5010, avg_hr_bpm=161, hr_max=184)
    assert running_index(activity_type="running", duration_seconds=11 * 60 + 59, **kwargs) is None
    assert running_index(activity_type="walking", duration_seconds=40 * 60, **kwargs) is None
    assert (
        running_index(
            activity_type="running",
            duration_seconds=40 * 60,
            distance_m=5010,
            avg_hr_bpm=None,
            hr_max=184,
        )
        is None
    )


def test_zone_load_session_avg_and_missing_hr():
    load = zone_training_load(
        duration_seconds=35 * 60, avg_hr_bpm=161, hr_max=184, hr_rest=60, hr_series=None
    )
    assert load is not None and 0 < load <= 200
    assert (
        zone_training_load(
            duration_seconds=35 * 60, avg_hr_bpm=None, hr_max=184, hr_rest=60, hr_series=None
        )
        is None
    )


def test_banister_sex_coefficient_male_higher():
    common = dict(duration_seconds=35 * 60, avg_hr_bpm=161, hr_max=184, hr_rest=60, hr_series=None)
    male = banister_trimp(sex="male", **common)
    female = banister_trimp(sex="female", **common)
    assert male is not None and female is not None
    assert male > female


def test_rtss_none_without_index():
    assert (
        running_rtss(running_index_value=None, duration_seconds=2108, pace_sec_per_km=421) is None
    )
    value = running_rtss(running_index_value=34.0, duration_seconds=2108, pace_sec_per_km=421)
    assert value is not None and value > 0


def test_power_prefers_watch():
    assert (
        estimate_power_w(watch_power_w=240, mass_kg=70, distance_m=5010, duration_seconds=2108)
        == 240
    )
    est = estimate_power_w(watch_power_w=None, mass_kg=70, distance_m=5010, duration_seconds=2108)
    assert est is not None and 100 < est < 300


def test_km_splits_partial_last_lap():
    points = [
        {"t": float(i), "lat": i / 111_320, "lng": 0.0, "alt": None} for i in range(0, 2501, 10)
    ]
    splits = km_splits(points, hr_points=[], cadence_points=[])
    assert len(splits) == 3
    assert abs(splits[0]["distance_m"] - 1000) < 30
    assert abs(splits[-1]["distance_m"] - 500) < 30
    assert abs(haversine_m(0, 0, 1 / 111_320, 0) - 1) < 0.05


def test_downsample_series_keeps_ends():
    points = [(float(i), float(i)) for i in range(1000)]
    out = downsample_series(points, max_points=600)
    assert len(out) == 600
    assert out[0] == points[0]
    assert out[-1] == points[-1]
    assert downsample_series(points[:10], max_points=600) == points[:10]


def test_hr_zones_session_avg():
    zones = hr_zones(
        duration_seconds=35 * 60,
        avg_hr_bpm=161,
        hr_max=184,
        hr_rest=60,
        hr_series=None,
    )
    assert len(zones) == 5
    assert sum(z["seconds"] for z in zones) == 35 * 60
    assert abs(sum(z["ratio"] for z in zones) - 1.0) < 1e-9
    empty = hr_zones(
        duration_seconds=35 * 60,
        avg_hr_bpm=None,
        hr_max=184,
        hr_rest=60,
        hr_series=None,
    )
    assert empty == []


def test_pace_zones_with_and_without_index():
    with_index = pace_zones(
        duration_seconds=2108,
        pace_sec_per_km=421,
        running_index_value=34.0,
        pace_series=None,
    )
    assert len(with_index) == 5
    assert [z["zone"] for z in with_index] == ["E", "M", "T", "I", "R"]
    assert with_index[0]["lo"] < with_index[0]["hi"]  # lo is faster (lower sec/km)

    without = pace_zones(
        duration_seconds=2108,
        pace_sec_per_km=421,
        running_index_value=None,
        pace_series=None,
    )
    assert len(without) == 5
    assert sum(z["seconds"] for z in without) == 2108

    assert (
        pace_zones(
            duration_seconds=2108,
            pace_sec_per_km=None,
            running_index_value=34.0,
            pace_series=None,
        )
        == []
    )


def test_formula_constants():
    assert RUNNING_INDEX_FORMULA.formula
    assert "估算" in RUNNING_INDEX_FORMULA.hint or "实验室" in RUNNING_INDEX_FORMULA.hint
    assert TRAINING_LOAD_FORMULA.formula
    assert "TRIMP" in TRAINING_LOAD_FORMULA.hint
    assert "rTSS" in TRAINING_LOAD_FORMULA.hint
