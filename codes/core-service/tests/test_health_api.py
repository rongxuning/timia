"""HTTP tests for personal health sync and views."""

from __future__ import annotations

import secrets
import uuid
from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from fastapi.testclient import TestClient

from app.main import app

PASSWORD = "password123!"


def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _register_and_login(client: TestClient) -> tuple[str, str]:
    suffix = secrets.token_hex(8)
    email = f"health-{suffix}@example.com"
    display_name = f"health-{suffix}"
    register = client.post(
        "/auth/register",
        json={"email": email, "password": PASSWORD, "display_name": display_name},
    )
    assert register.status_code == 201, register.text
    login = client.post("/auth/login", json={"email": email, "password": PASSWORD})
    assert login.status_code == 200, login.text
    return email, login.json()["access_token"]


def test_requires_auth_for_health_sync_status():
    client = TestClient(app)
    resp = client.get("/health/sync-status")
    assert resp.status_code == 401


def test_requires_auth_for_health_sync_samples():
    client = TestClient(app)
    resp = client.post("/health/sync/samples", json={"timezone": "Asia/Shanghai", "samples": []})
    assert resp.status_code == 401


def test_requires_auth_for_views_me_health():
    client = TestClient(app)
    resp = client.get("/views/me/health")
    assert resp.status_code == 401


def test_unknown_metric_type_rejected():
    client = TestClient(app)
    _, token = _register_and_login(client)
    hk = str(uuid.uuid4())
    now = datetime(2026, 8, 27, 8, 0, tzinfo=timezone.utc).isoformat()
    resp = client.post(
        "/health/sync/samples",
        headers=_headers(token),
        json={
            "timezone": "Asia/Shanghai",
            "samples": [
                {
                    "hk_uuid": hk,
                    "metric_type": "not_a_metric",
                    "start_at": now,
                    "end_at": now,
                    "value": 1,
                    "unit": "count",
                }
            ],
        },
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "unknown_metric_type"


def test_running_speed_sample_accepted():
    client = TestClient(app)
    _, token = _register_and_login(client)
    now = datetime.now(timezone.utc).isoformat()
    resp = client.post(
        "/health/sync/samples",
        headers=_headers(token),
        json={
            "timezone": "Asia/Shanghai",
            "samples": [
                {
                    "hk_uuid": str(uuid.uuid4()),
                    "metric_type": "running_speed",
                    "start_at": now,
                    "end_at": now,
                    "value": 3.5,
                    "unit": "m/s",
                }
            ],
        },
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["upserted"] == 1


def test_sample_batch_too_large():
    client = TestClient(app)
    _, token = _register_and_login(client)
    now = datetime(2026, 8, 27, 8, 0, tzinfo=timezone.utc).isoformat()
    samples = [
        {
            "hk_uuid": str(uuid.uuid4()),
            "metric_type": "step_count",
            "start_at": now,
            "end_at": now,
            "value": 1,
            "unit": "count",
        }
        for _ in range(501)
    ]
    resp = client.post(
        "/health/sync/samples",
        headers=_headers(token),
        json={"timezone": "Asia/Shanghai", "samples": samples},
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "batch_too_large"


def test_quantity_upsert_is_idempotent_and_rolls_daily():
    client = TestClient(app)
    _, token = _register_and_login(client)
    hk = str(uuid.uuid4())
    start = datetime.now(timezone.utc).isoformat()
    payload = {
        "timezone": "Asia/Shanghai",
        "samples": [
            {
                "hk_uuid": hk,
                "metric_type": "step_count",
                "start_at": start,
                "end_at": start,
                "value": 100,
                "unit": "count",
            }
        ],
    }
    first = client.post("/health/sync/samples", headers=_headers(token), json=payload)
    assert first.status_code == 200, first.text
    assert first.json()["upserted"] == 1

    payload["samples"][0]["value"] = 250
    second = client.post("/health/sync/samples", headers=_headers(token), json=payload)
    assert second.status_code == 200
    assert second.json()["upserted"] == 1

    view = client.get("/views/me/health", headers=_headers(token))
    assert view.status_code == 200, view.text
    body = view.json()
    assert body["current"]["steps"] == 250


def test_users_cannot_see_each_others_health():
    client = TestClient(app)
    _, token_a = _register_and_login(client)
    _, token_b = _register_and_login(client)
    now = datetime.now(timezone.utc).isoformat()
    client.post(
        "/health/sync/samples",
        headers=_headers(token_a),
        json={
            "timezone": "Asia/Shanghai",
            "samples": [
                {
                    "hk_uuid": str(uuid.uuid4()),
                    "metric_type": "step_count",
                    "start_at": now,
                    "end_at": now,
                    "value": 9999,
                    "unit": "count",
                }
            ],
        },
    )
    view = client.get("/views/me/health", headers=_headers(token_b))
    assert view.status_code == 200
    assert view.json()["current"]["steps"] is None


def test_sleep_sync_excludes_in_bed_from_asleep_total():
    client = TestClient(app)
    _, token = _register_and_login(client)
    end = datetime.now(timezone.utc).replace(microsecond=0)
    in_bed_end = end.isoformat()
    in_bed_start = (end - timedelta(hours=8)).isoformat()
    core_end = (end - timedelta(hours=5)).isoformat()
    resp = client.post(
        "/health/sync/sleep",
        headers=_headers(token),
        json={
            "timezone": "Asia/Shanghai",
            "samples": [
                {
                    "hk_uuid": str(uuid.uuid4()),
                    "start_at": in_bed_start,
                    "end_at": in_bed_end,
                    "stage": "in_bed",
                    "timezone": "Asia/Shanghai",
                },
                {
                    "hk_uuid": str(uuid.uuid4()),
                    "start_at": in_bed_start,
                    "end_at": core_end,
                    "stage": "core",
                    "timezone": "Asia/Shanghai",
                },
            ],
        },
    )
    assert resp.status_code == 200, resp.text
    view = client.get("/views/me/health", headers=_headers(token))
    current = view.json()["current"]
    assert current["sleep_in_bed_minutes"] == 8 * 60
    assert current["sleep_asleep_minutes"] == 3 * 60


def test_health_view_accepts_date_and_range():
    client = TestClient(app)
    _, token = _register_and_login(client)
    past = datetime.now(timezone.utc) - timedelta(days=2)
    synced = client.post(
        "/health/sync/samples",
        headers=_headers(token),
        json={
            "timezone": "Asia/Shanghai",
            "samples": [
                {
                    "hk_uuid": str(uuid.uuid4()),
                    "metric_type": "step_count",
                    "start_at": past.isoformat(),
                    "end_at": past.isoformat(),
                    "value": 4321,
                    "unit": "count",
                }
            ],
        },
    )
    assert synced.status_code == 200, synced.text
    local_date = synced.json()["local_dates"][0]
    view = client.get(f"/views/me/health?date={local_date}", headers=_headers(token))
    assert view.status_code == 200, view.text
    assert view.json()["mode"] == "day"
    assert view.json()["selected_date"] == local_date
    assert view.json()["current"]["steps"] == 4321
    ranged = client.get("/views/me/health?range=7", headers=_headers(token))
    assert ranged.status_code == 200
    assert ranged.json()["mode"] == "range"
    assert ranged.json()["range_days"] == 7
    assert ranged.json()["current"]["steps"] == 4321
    assert ranged.json()["totals"]["steps"] == 4321
    assert ranged.json()["scores"]["steps"] == 43
    bad = client.get("/views/me/health?range=15", headers=_headers(token))
    assert bad.status_code == 400
    assert bad.json()["detail"] == "invalid_range"


def test_health_view_calendar_marks_metrics_and_workouts():
    client = TestClient(app)
    _, token = _register_and_login(client)
    now = datetime.now(timezone.utc)
    client.post(
        "/health/sync/samples",
        headers=_headers(token),
        json={
            "timezone": "Asia/Shanghai",
            "samples": [
                {
                    "hk_uuid": str(uuid.uuid4()),
                    "metric_type": "step_count",
                    "start_at": now.isoformat(),
                    "end_at": now.isoformat(),
                    "value": 10,
                    "unit": "count",
                }
            ],
        },
    )
    client.post(
        "/health/sync/workouts",
        headers=_headers(token),
        json={
            "timezone": "Asia/Shanghai",
            "workouts": [
                {
                    "hk_uuid": str(uuid.uuid4()),
                    "activity_type": "running",
                    "start_at": now.isoformat(),
                    "end_at": (now + timedelta(minutes=20)).isoformat(),
                    "duration_seconds": 1200,
                }
            ],
        },
    )
    view = client.get("/views/me/health", headers=_headers(token))
    assert view.status_code == 200
    days = {item["local_date"]: item for item in view.json()["calendar_days"]}
    today = view.json()["selected_date"]
    assert days[today]["has_metrics"] is True
    assert days[today]["has_workout"] is True


def test_health_view_carries_forward_latest_weight():
    client = TestClient(app)
    _, token = _register_and_login(client)
    past = datetime.now(timezone.utc) - timedelta(days=3)
    client.post(
        "/health/sync/samples",
        headers=_headers(token),
        json={
            "timezone": "Asia/Shanghai",
            "samples": [
                {
                    "hk_uuid": str(uuid.uuid4()),
                    "metric_type": "body_mass",
                    "start_at": past.isoformat(),
                    "end_at": past.isoformat(),
                    "value": 62.5,
                    "unit": "kg",
                }
            ],
        },
    )
    view = client.get("/views/me/health", headers=_headers(token))
    assert view.status_code == 200
    assert view.json()["current"]["body_mass_kg"] == 62.5
    assert view.json()["scores"]["weight"] is None
    assert view.json()["card_order"][0] == "steps"


def test_health_layout_persists_card_order():
    client = TestClient(app)
    _, token = _register_and_login(client)
    patched = client.patch(
        "/health/layout",
        headers=_headers(token),
        json={"card_order": ["sleep", "steps", "not_a_card"]},
    )
    assert patched.status_code == 200, patched.text
    order = patched.json()["card_order"]
    assert order[0] == "sleep"
    assert order[1] == "steps"
    view = client.get("/views/me/health", headers=_headers(token))
    assert view.json()["card_order"][0] == "sleep"


def test_health_layout_rejects_unknown_only_order():
    client = TestClient(app)
    _, token = _register_and_login(client)
    resp = client.patch(
        "/health/layout",
        headers=_headers(token),
        json={"card_order": ["nope"]},
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "invalid_card_order"


def test_hiit_workout_is_not_stored_as_other():
    client = TestClient(app)
    _, token = _register_and_login(client)
    now = datetime.now(timezone.utc)
    resp = client.post(
        "/health/sync/workouts",
        headers=_headers(token),
        json={
            "timezone": "Asia/Shanghai",
            "workouts": [
                {
                    "hk_uuid": str(uuid.uuid4()),
                    "activity_type": "other",
                    "activity_type_raw": "highIntensityIntervalTraining",
                    "start_at": now.isoformat(),
                    "end_at": (now + timedelta(minutes=12)).isoformat(),
                    "duration_seconds": 720,
                }
            ],
        },
    )
    assert resp.status_code == 200, resp.text
    view = client.get("/views/me/health", headers=_headers(token))
    workouts = view.json()["recent_workouts"]
    assert workouts[0]["activity_type"] == "hiit"


def test_workout_card_metrics_round_trip():
    client = TestClient(app)
    _, token = _register_and_login(client)
    now = datetime.now(timezone.utc)
    resp = client.post(
        "/health/sync/workouts",
        headers=_headers(token),
        json={
            "timezone": "Asia/Shanghai",
            "workouts": [
                {
                    "hk_uuid": str(uuid.uuid4()),
                    "activity_type": "running",
                    "start_at": now.isoformat(),
                    "end_at": (now + timedelta(minutes=25)).isoformat(),
                    "duration_seconds": 1500,
                    "active_energy_kcal": 341,
                    "distance_m": 3940,
                    "avg_hr_bpm": 148,
                    "avg_cadence_spm": 172,
                    "avg_pace_sec_per_km": 381,
                    "weather_temp_c": 26.4,
                    "weather_humidity": 0.62,
                    "location_country": "中国",
                    "location_admin": "上海市",
                    "location_city": "浦东新区",
                }
            ],
        },
    )
    assert resp.status_code == 200, resp.text
    view = client.get("/views/me/health", headers=_headers(token))
    workout = view.json()["recent_workouts"][0]
    assert workout["avg_hr_bpm"] == 148
    assert workout["avg_cadence_spm"] == 172
    assert workout["avg_pace_sec_per_km"] == 381
    assert workout["weather_temp_c"] == 26.4
    assert workout["location_city"] == "浦东新区"
    steps_formula = view.json()["score_formulas"]["steps"]
    assert steps_formula["formula"].startswith("clamp(")
    assert "10000" in steps_formula["hint"]


def test_workout_elevation_round_trip():
    client = TestClient(app)
    _, token = _register_and_login(client)
    now = datetime.now(timezone.utc)
    resp = client.post(
        "/health/sync/workouts",
        headers=_headers(token),
        json={
            "timezone": "Asia/Shanghai",
            "workouts": [
                {
                    "hk_uuid": str(uuid.uuid4()),
                    "activity_type": "running",
                    "start_at": now.isoformat(),
                    "end_at": (now + timedelta(minutes=30)).isoformat(),
                    "duration_seconds": 1800,
                    "elevation_ascended_m": 12,
                    "elevation_descended_m": 8,
                }
            ],
        },
    )
    assert resp.status_code == 200, resp.text
    view = client.get("/views/me/health", headers=_headers(token))
    assert view.status_code == 200, view.text
    workout = view.json()["recent_workouts"][0]
    assert workout["elevation_ascended_m"] == 12
    assert workout["elevation_descended_m"] == 8


def _shanghai_today() -> date:
    return datetime.now(ZoneInfo("Asia/Shanghai")).date()


def _workout_payload(local_day: date, *, hour: int = 10) -> dict:
    tz = ZoneInfo("Asia/Shanghai")
    start = datetime(local_day.year, local_day.month, local_day.day, hour, 0, tzinfo=tz)
    end = start + timedelta(minutes=30)
    return {
        "hk_uuid": str(uuid.uuid4()),
        "activity_type": "running",
        "start_at": start.isoformat(),
        "end_at": end.isoformat(),
        "duration_seconds": 1800,
    }


def test_requires_auth_for_views_me_health_workouts():
    client = TestClient(app)
    resp = client.get("/views/me/health/workouts")
    assert resp.status_code == 401


def test_health_workouts_page_uses_seven_day_windows():
    client = TestClient(app)
    _, token = _register_and_login(client)
    today = _shanghai_today()
    in_window = _workout_payload(today)
    older = _workout_payload(today - timedelta(days=7))
    resp = client.post(
        "/health/sync/workouts",
        headers=_headers(token),
        json={"timezone": "Asia/Shanghai", "workouts": [in_window, older]},
    )
    assert resp.status_code == 200, resp.text

    view = client.get("/views/me/health", headers=_headers(token))
    assert view.status_code == 200, view.text
    body = view.json()
    assert body["workout_end_date"] == today.isoformat()
    assert body["workout_start_date"] == (today - timedelta(days=6)).isoformat()
    assert body["workout_has_more"] is True
    recent_ids = {item["hk_uuid"] for item in body["recent_workouts"]}
    assert in_window["hk_uuid"] in recent_ids
    assert older["hk_uuid"] not in recent_ids

    first = client.get("/views/me/health/workouts", headers=_headers(token))
    assert first.status_code == 200, first.text
    first_body = first.json()
    assert first_body["days"] == 7
    assert first_body["end_date"] == today.isoformat()
    assert first_body["start_date"] == (today - timedelta(days=6)).isoformat()
    assert first_body["has_more"] is True
    first_ids = {item["hk_uuid"] for item in first_body["workouts"]}
    assert first_ids == {in_window["hk_uuid"]}

    older_end = (today - timedelta(days=7)).isoformat()
    second = client.get(
        f"/views/me/health/workouts?end={older_end}&days=7",
        headers=_headers(token),
    )
    assert second.status_code == 200, second.text
    second_body = second.json()
    assert second_body["end_date"] == older_end
    assert second_body["has_more"] is False
    second_ids = {item["hk_uuid"] for item in second_body["workouts"]}
    assert second_ids == {older["hk_uuid"]}


def test_health_workouts_rejects_future_end_date():
    client = TestClient(app)
    _, token = _register_and_login(client)
    future = (_shanghai_today() + timedelta(days=1)).isoformat()
    resp = client.get(f"/views/me/health/workouts?end={future}", headers=_headers(token))
    assert resp.status_code == 400
    assert resp.json()["detail"] == "invalid_date"


def test_requires_auth_for_health_profile():
    client = TestClient(app)
    assert client.get("/health/profile").status_code == 401
    assert client.patch("/health/profile", json={"sex": "male"}).status_code == 401


def test_health_profile_persists_and_unlocks_energy_scores():
    client = TestClient(app)
    _, token = _register_and_login(client)
    empty = client.get("/health/profile", headers=_headers(token))
    assert empty.status_code == 200
    assert empty.json()["sex"] is None

    bad = client.patch("/health/profile", headers=_headers(token), json={"sex": "unknown"})
    assert bad.status_code == 400
    assert bad.json()["detail"] == "invalid_sex"

    saved = client.patch(
        "/health/profile",
        headers=_headers(token),
        json={"sex": "male", "age_years": 30, "height_cm": 175},
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["sex"] == "male"
    assert saved.json()["age_years"] == 30
    assert saved.json()["height_cm"] == 175

    now = datetime.now(timezone.utc)
    client.post(
        "/health/sync/samples",
        headers=_headers(token),
        json={
            "timezone": "Asia/Shanghai",
            "samples": [
                {
                    "hk_uuid": str(uuid.uuid4()),
                    "metric_type": "body_mass",
                    "start_at": now.isoformat(),
                    "end_at": now.isoformat(),
                    "value": 70,
                    "unit": "kg",
                },
                {
                    "hk_uuid": str(uuid.uuid4()),
                    "metric_type": "basal_energy",
                    "start_at": now.isoformat(),
                    "end_at": now.isoformat(),
                    "value": 1649,
                    "unit": "kcal",
                },
                {
                    "hk_uuid": str(uuid.uuid4()),
                    "metric_type": "active_energy",
                    "start_at": now.isoformat(),
                    "end_at": now.isoformat(),
                    "value": 660,
                    "unit": "kcal",
                },
            ],
        },
    )
    view = client.get("/views/me/health", headers=_headers(token))
    assert view.status_code == 200, view.text
    body = view.json()
    assert body["profile"]["sex"] == "male"
    assert body["energy_targets"]["bmr_kcal"] == 1648.75
    assert body["scores"]["basal"] == 100
    assert body["scores"]["active"] == 100
    assert "Mifflin" in body["score_formulas"]["basal"]["hint"]


def test_health_profile_max_hr_bpm():
    client = TestClient(app)
    _, token = _register_and_login(client)
    bad = client.patch("/health/profile", headers=_headers(token), json={"max_hr_bpm": 70})
    assert bad.status_code == 400
    assert bad.json()["detail"] == "invalid_max_hr"
    saved = client.patch("/health/profile", headers=_headers(token), json={"max_hr_bpm": 188})
    assert saved.status_code == 200
    assert saved.json()["max_hr_bpm"] == 188
    cleared = client.patch("/health/profile", headers=_headers(token), json={"max_hr_bpm": None})
    assert cleared.json()["max_hr_bpm"] is None


def test_requires_auth_for_health_card_detail():
    client = TestClient(app)
    assert client.get("/views/me/health/cards/steps").status_code == 401


def test_health_card_detail_unknown_metric():
    client = TestClient(app)
    _, token = _register_and_login(client)
    resp = client.get("/views/me/health/cards/not_a_card", headers=_headers(token))
    assert resp.status_code == 404
    assert resp.json()["detail"] == "unknown_metric"


def test_health_card_detail_steps_hourly_from_samples():
    client = TestClient(app)
    _, token = _register_and_login(client)
    tz = ZoneInfo("Asia/Shanghai")
    today = _shanghai_today()
    start = datetime(today.year, today.month, today.day, 8, 0, tzinfo=tz)
    end = start + timedelta(hours=1)
    client.post(
        "/health/sync/samples",
        headers=_headers(token),
        json={
            "timezone": "Asia/Shanghai",
            "samples": [
                {
                    "hk_uuid": str(uuid.uuid4()),
                    "metric_type": "step_count",
                    "start_at": start.isoformat(),
                    "end_at": end.isoformat(),
                    "value": 1200,
                    "unit": "count",
                },
                {
                    "hk_uuid": str(uuid.uuid4()),
                    "metric_type": "distance_walking_running",
                    "start_at": start.isoformat(),
                    "end_at": end.isoformat(),
                    "value": 800,
                    "unit": "m",
                },
            ],
        },
    )
    resp = client.get(f"/views/me/health/cards/steps?date={today.isoformat()}", headers=_headers(token))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["metric"] == "steps"
    assert body["hourly"][8]["value"] == 1200
    assert body["stats"]["distance_m"] == 800


def _three_route_points() -> list[dict]:
    return [
        {"t": 0.0, "lat": 31.23, "lng": 121.47, "alt": 5.0},
        {"t": 30.0, "lat": 31.231, "lng": 121.471, "alt": 6.0},
        {"t": 60.0, "lat": 31.232, "lng": 121.472, "alt": 7.0},
    ]


def test_sync_workout_route_after_workout():
    client = TestClient(app)
    _, token = _register_and_login(client)
    hk = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    workout = client.post(
        "/health/sync/workouts",
        headers=_headers(token),
        json={
            "timezone": "Asia/Shanghai",
            "workouts": [
                {
                    "hk_uuid": hk,
                    "activity_type": "running",
                    "start_at": now.isoformat(),
                    "end_at": (now + timedelta(minutes=10)).isoformat(),
                    "duration_seconds": 600,
                }
            ],
        },
    )
    assert workout.status_code == 200, workout.text
    resp = client.post(
        "/health/sync/workout-routes",
        headers=_headers(token),
        json={
            "timezone": "Asia/Shanghai",
            "routes": [{"hk_uuid": hk, "points": _three_route_points()}],
        },
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["upserted"] == 1


def test_sync_workout_route_without_workout_not_found():
    client = TestClient(app)
    _, token = _register_and_login(client)
    resp = client.post(
        "/health/sync/workout-routes",
        headers=_headers(token),
        json={
            "timezone": "Asia/Shanghai",
            "routes": [{"hk_uuid": str(uuid.uuid4()), "points": _three_route_points()}],
        },
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "workout_not_found"


def test_sync_workout_routes_batch_too_large():
    client = TestClient(app)
    _, token = _register_and_login(client)
    routes = [
        {"hk_uuid": str(uuid.uuid4()), "points": _three_route_points()} for _ in range(11)
    ]
    resp = client.post(
        "/health/sync/workout-routes",
        headers=_headers(token),
        json={"timezone": "Asia/Shanghai", "routes": routes},
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "batch_too_large"


def test_deleted_workout_rejects_route_resync():
    client = TestClient(app)
    _, token = _register_and_login(client)
    hk = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    workout = client.post(
        "/health/sync/workouts",
        headers=_headers(token),
        json={
            "timezone": "Asia/Shanghai",
            "workouts": [
                {
                    "hk_uuid": hk,
                    "activity_type": "running",
                    "start_at": now.isoformat(),
                    "end_at": (now + timedelta(minutes=10)).isoformat(),
                    "duration_seconds": 600,
                }
            ],
        },
    )
    assert workout.status_code == 200, workout.text
    route = client.post(
        "/health/sync/workout-routes",
        headers=_headers(token),
        json={
            "timezone": "Asia/Shanghai",
            "routes": [{"hk_uuid": hk, "points": _three_route_points()}],
        },
    )
    assert route.status_code == 200, route.text
    deleted = client.post(
        "/health/sync/deletions",
        headers=_headers(token),
        json={
            "timezone": "Asia/Shanghai",
            "deletions": [{"hk_uuid": hk, "kind": "workout"}],
        },
    )
    assert deleted.status_code == 200, deleted.text
    again = client.post(
        "/health/sync/workout-routes",
        headers=_headers(token),
        json={
            "timezone": "Asia/Shanghai",
            "routes": [{"hk_uuid": hk, "points": _three_route_points()}],
        },
    )
    assert again.status_code == 400
    assert again.json()["detail"] == "workout_not_found"


