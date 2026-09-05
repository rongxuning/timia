"""HTTP tests for personal health sync and views."""

from __future__ import annotations

import gzip
import json
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


def test_requires_auth_for_health_sync_runs():
    client = TestClient(app)
    now = datetime.now(timezone.utc).isoformat()
    resp = client.post(
        "/health/sync/runs",
        json={"source": "manual", "status": "success", "to_at": now},
    )
    assert resp.status_code == 401


def test_health_sync_status_uses_daily_and_records_runs():
    client = TestClient(app)
    _, token = _register_and_login(client)
    now = datetime.now(timezone.utc)
    synced = client.post(
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
                    "value": 1200,
                    "unit": "count",
                }
            ],
        },
    )
    assert synced.status_code == 200, synced.text
    local_date = synced.json()["local_dates"][0]
    to_at = (now + timedelta(minutes=1)).isoformat()
    recorded = client.post(
        "/health/sync/runs",
        headers=_headers(token),
        json={
            "source": "manual",
            "status": "success",
            "from_at": (now - timedelta(days=90)).isoformat(),
            "to_at": to_at,
            "quantity_count": 1,
            "upserted": 1,
            "local_dates": [local_date],
        },
    )
    assert recorded.status_code == 200, recorded.text
    assert recorded.json()["source"] == "manual"
    assert recorded.json()["upserted"] == 1
    status = client.get("/health/sync-status", headers=_headers(token))
    assert status.status_code == 200, status.text
    body = status.json()
    assert body["last_synced_at"] is not None
    assert any(day["local_date"] == local_date and day["quantity_count"] > 0 for day in body["days"])
    assert len(body["runs"]) == 1
    assert body["runs"][0]["quantity_count"] == 1
    later = client.post(
        "/health/sync/runs",
        headers=_headers(token),
        json={
            "source": "background",
            "status": "success",
            "to_at": (now - timedelta(days=1)).isoformat(),
            "upserted": 0,
        },
    )
    assert later.status_code == 200
    again = client.get("/health/sync-status", headers=_headers(token))
    assert again.json()["last_synced_at"] == body["last_synced_at"]
    assert len(again.json()["runs"]) == 2


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
    assert view.json()["hourly"]["steps"][0]["hour"] == 0
    assert any(slot["value"] for slot in view.json()["hourly"]["steps"])
    assert ranged.json()["hourly"] == {}
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
    overview = client.get(f"/views/me/health?date={today.isoformat()}", headers=_headers(token))
    assert overview.status_code == 200, overview.text
    assert overview.json()["hourly"]["steps"][8]["value"] == 1200


def test_quantity_sync_dedupes_overlapping_step_sources():
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
                    "value": 5000,
                    "unit": "count",
                    "source_bundle_id": "com.apple.health.iphone",
                },
                {
                    "hk_uuid": str(uuid.uuid4()),
                    "metric_type": "step_count",
                    "start_at": start.isoformat(),
                    "end_at": end.isoformat(),
                    "value": 5000,
                    "unit": "count",
                    "source_bundle_id": "com.apple.health.watch",
                },
            ],
        },
    )
    view = client.get(f"/views/me/health?date={today.isoformat()}", headers=_headers(token))
    assert view.status_code == 200, view.text
    assert view.json()["current"]["steps"] == 5000
    steps = client.get(f"/views/me/health/cards/steps?date={today.isoformat()}", headers=_headers(token))
    assert steps.status_code == 200, steps.text
    assert steps.json()["hourly"][8]["value"] == 5000


def test_health_card_detail_rhr_range_keeps_today_hourly():
    client = TestClient(app)
    _, token = _register_and_login(client)
    tz = ZoneInfo("Asia/Shanghai")
    today = _shanghai_today()
    at = datetime(today.year, today.month, today.day, 10, 15, tzinfo=tz)
    posted = client.post(
        "/health/sync/samples",
        headers=_headers(token),
        json={
            "timezone": "Asia/Shanghai",
            "samples": [
                {
                    "hk_uuid": str(uuid.uuid4()),
                    "metric_type": "heart_rate",
                    "start_at": at.isoformat(),
                    "end_at": at.isoformat(),
                    "value": 72,
                    "unit": "count/min",
                }
            ],
        },
    )
    assert posted.status_code == 200, posted.text
    resp = client.get("/views/me/health/cards/rhr?range=7", headers=_headers(token))
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["mode"] == "range"
    assert body["focus_date"] == today.isoformat()
    hour = body["hourly_heart_rate"][10]
    assert hour["value"] == 72
    assert hour["min"] == 72
    assert hour["max"] == 72


def test_health_card_detail_hrv_range_keeps_today_samples():
    client = TestClient(app)
    _, token = _register_and_login(client)
    tz = ZoneInfo("Asia/Shanghai")
    today = _shanghai_today()
    yesterday = today - timedelta(days=1)
    today_at = datetime(today.year, today.month, today.day, 10, 15, tzinfo=tz)
    yesterday_at = datetime(yesterday.year, yesterday.month, yesterday.day, 21, 40, tzinfo=tz)
    posted = client.post(
        "/health/sync/samples",
        headers=_headers(token),
        json={
            "timezone": "Asia/Shanghai",
            "samples": [
                {
                    "hk_uuid": str(uuid.uuid4()),
                    "metric_type": "hrv_sdnn",
                    "start_at": today_at.isoformat(),
                    "end_at": today_at.isoformat(),
                    "value": 42,
                    "unit": "ms",
                },
                {
                    "hk_uuid": str(uuid.uuid4()),
                    "metric_type": "hrv_sdnn",
                    "start_at": yesterday_at.isoformat(),
                    "end_at": yesterday_at.isoformat(),
                    "value": 88,
                    "unit": "ms",
                },
            ],
        },
    )
    assert posted.status_code == 200, posted.text

    ranged = client.get("/views/me/health/cards/hrv?range=7", headers=_headers(token))
    assert ranged.status_code == 200, ranged.text
    body = ranged.json()
    assert body["mode"] == "range"
    assert body["focus_date"] == today.isoformat()
    assert [row["value"] for row in body["samples"]] == [42]
    assert {row["local_date"] for row in body["hrv_days"]} == {
        today.isoformat(),
        yesterday.isoformat(),
    }

    ranged_30 = client.get("/views/me/health/cards/hrv?range=30", headers=_headers(token))
    assert ranged_30.status_code == 200, ranged_30.text
    body_30 = ranged_30.json()
    assert body_30["focus_date"] == today.isoformat()
    assert [row["value"] for row in body_30["samples"]] == [42]
    assert body_30["samples"] == body["samples"]

    # 日视图：带 date=today、不带 range，样本仍应是当天；近日列表含昨日。
    today_only = client.get(
        f"/views/me/health/cards/hrv?date={today.isoformat()}",
        headers=_headers(token),
    )
    assert today_only.status_code == 200, today_only.text
    today_body = today_only.json()
    assert today_body["mode"] == "day"
    assert today_body["focus_date"] == today.isoformat()
    assert [row["value"] for row in today_body["samples"]] == [42]
    assert {row["local_date"] for row in today_body["hrv_days"]} == {
        today.isoformat(),
        yesterday.isoformat(),
    }

    dated = client.get(
        f"/views/me/health/cards/hrv?date={yesterday.isoformat()}",
        headers=_headers(token),
    )
    assert dated.status_code == 200, dated.text
    day_body = dated.json()
    assert day_body["mode"] == "day"
    assert day_body["focus_date"] == yesterday.isoformat()
    assert [row["value"] for row in day_body["samples"]] == [88]


def test_health_card_detail_hrv_days_window_and_zones():
    client = TestClient(app)
    _, token = _register_and_login(client)
    tz = ZoneInfo("Asia/Shanghai")
    today = _shanghai_today()
    inside = today - timedelta(days=5)
    outside = today - timedelta(days=12)
    samples = []
    for day, values in (
        (today, [(10, 0, 30), (10, 30, 54), (11, 0, 72)]),
        (inside, [(9, 0, 60), (10, 0, 90)]),
        (outside, [(8, 0, 20)]),
    ):
        for hour, minute, value in values:
            at = datetime(day.year, day.month, day.day, hour, minute, tzinfo=tz)
            samples.append(
                {
                    "hk_uuid": str(uuid.uuid4()),
                    "metric_type": "hrv_sdnn",
                    "start_at": at.isoformat(),
                    "end_at": at.isoformat(),
                    "value": value,
                    "unit": "ms",
                }
            )
    # Sparse overnight gap should cap at 2h
    sparse_a = datetime(inside.year, inside.month, inside.day, 1, 0, tzinfo=tz)
    sparse_b = datetime(inside.year, inside.month, inside.day, 5, 0, tzinfo=tz)
    samples.extend(
        [
            {
                "hk_uuid": str(uuid.uuid4()),
                "metric_type": "hrv_sdnn",
                "start_at": sparse_a.isoformat(),
                "end_at": sparse_a.isoformat(),
                "value": 20,
                "unit": "ms",
            },
            {
                "hk_uuid": str(uuid.uuid4()),
                "metric_type": "hrv_sdnn",
                "start_at": sparse_b.isoformat(),
                "end_at": sparse_b.isoformat(),
                "value": 20,
                "unit": "ms",
            },
        ]
    )
    posted = client.post(
        "/health/sync/samples",
        headers=_headers(token),
        json={"timezone": "Asia/Shanghai", "samples": samples},
    )
    assert posted.status_code == 200, posted.text

    day_resp = client.get(
        f"/views/me/health/cards/hrv?date={today.isoformat()}",
        headers=_headers(token),
    )
    assert day_resp.status_code == 200, day_resp.text
    day_body = day_resp.json()
    day_dates = {row["local_date"] for row in day_body["hrv_days"]}
    assert day_dates == {today.isoformat(), inside.isoformat()}
    assert outside.isoformat() not in day_dates
    assert [row["value"] for row in day_body["samples"]] == [30, 54, 72]

    today_row = next(row for row in day_body["hrv_days"] if row["local_date"] == today.isoformat())
    # median([30,54,72]) = 54 → round(100*54/60)=90
    assert today_row["score"] == 90
    assert today_row["hrv_median_ms"] == 54
    # 30ms→low 30m; 54ms→high 30m; last sample has no trailing duration
    assert today_row["low_minutes"] == 30.0
    assert today_row["high_minutes"] == 30.0
    assert today_row["mid_minutes"] == 0.0
    assert today_row["good_minutes"] == 0.0
    assert abs(today_row["low_ratio"] - 0.5) < 1e-6
    assert abs(today_row["high_ratio"] - 0.5) < 1e-6

    inside_row = next(row for row in day_body["hrv_days"] if row["local_date"] == inside.isoformat())
    # 01:00→05:00 and 05:00→09:00 capped at 2h each (low); 09:00→10:00 = 60m high
    assert inside_row["low_minutes"] == 240.0
    assert inside_row["high_minutes"] == 60.0

    ranged = client.get("/views/me/health/cards/hrv?range=7", headers=_headers(token))
    assert ranged.status_code == 200, ranged.text
    ranged_body = ranged.json()
    assert [row["value"] for row in ranged_body["samples"]] == [30, 54, 72]
    ranged_dates = {row["local_date"] for row in ranged_body["hrv_days"]}
    assert ranged_dates == {today.isoformat(), inside.isoformat()}
    assert outside.isoformat() not in ranged_dates
    assert len(ranged_body["hrv_days"]) == 2

    # range=7 window is 7 days; outside (12d ago) still excluded; same as day lookback for these points
    ranged_30 = client.get("/views/me/health/cards/hrv?range=30", headers=_headers(token))
    assert ranged_30.status_code == 200, ranged_30.text
    dates_30 = {row["local_date"] for row in ranged_30.json()["hrv_days"]}
    assert outside.isoformat() in dates_30
    assert [row["value"] for row in ranged_30.json()["samples"]] == [30, 54, 72]


def test_health_card_detail_spo2_range_keeps_today_samples():
    client = TestClient(app)
    _, token = _register_and_login(client)
    tz = ZoneInfo("Asia/Shanghai")
    today = _shanghai_today()
    yesterday = today - timedelta(days=1)
    today_at = datetime(today.year, today.month, today.day, 10, 15, tzinfo=tz)
    yesterday_at = datetime(yesterday.year, yesterday.month, yesterday.day, 21, 40, tzinfo=tz)
    posted = client.post(
        "/health/sync/samples",
        headers=_headers(token),
        json={
            "timezone": "Asia/Shanghai",
            "samples": [
                {
                    "hk_uuid": str(uuid.uuid4()),
                    "metric_type": "oxygen_saturation",
                    "start_at": today_at.isoformat(),
                    "end_at": today_at.isoformat(),
                    "value": 0.96,
                    "unit": "%",
                },
                {
                    "hk_uuid": str(uuid.uuid4()),
                    "metric_type": "oxygen_saturation",
                    "start_at": yesterday_at.isoformat(),
                    "end_at": yesterday_at.isoformat(),
                    "value": 0.94,
                    "unit": "%",
                },
            ],
        },
    )
    assert posted.status_code == 200, posted.text

    ranged = client.get("/views/me/health/cards/spo2?range=7", headers=_headers(token))
    assert ranged.status_code == 200, ranged.text
    body = ranged.json()
    assert body["mode"] == "range"
    assert body["focus_date"] == today.isoformat()
    assert [row["value"] for row in body["samples"]] == [0.96]
    assert {row["local_date"] for row in body["spo2_days"]} == {
        today.isoformat(),
        yesterday.isoformat(),
    }
    hour_10 = next(row for row in body["hourly"] if row["hour"] == 10)
    assert abs(hour_10["value"] - 0.96) < 1e-6

    ranged_30 = client.get("/views/me/health/cards/spo2?range=30", headers=_headers(token))
    assert ranged_30.status_code == 200, ranged_30.text
    body_30 = ranged_30.json()
    assert body_30["focus_date"] == today.isoformat()
    assert [row["value"] for row in body_30["samples"]] == [0.96]
    assert body_30["samples"] == body["samples"]
    assert body_30["hourly"] == body["hourly"]

    today_only = client.get(
        f"/views/me/health/cards/spo2?date={today.isoformat()}",
        headers=_headers(token),
    )
    assert today_only.status_code == 200, today_only.text
    today_body = today_only.json()
    assert today_body["mode"] == "day"
    assert today_body["focus_date"] == today.isoformat()
    assert [row["value"] for row in today_body["samples"]] == [0.96]
    assert {row["local_date"] for row in today_body["spo2_days"]} == {
        today.isoformat(),
        yesterday.isoformat(),
    }

    dated = client.get(
        f"/views/me/health/cards/spo2?date={yesterday.isoformat()}",
        headers=_headers(token),
    )
    assert dated.status_code == 200, dated.text
    day_body = dated.json()
    assert day_body["mode"] == "day"
    assert day_body["focus_date"] == yesterday.isoformat()
    assert [row["value"] for row in day_body["samples"]] == [0.94]


def test_health_card_detail_spo2_days_window_and_zones():
    client = TestClient(app)
    _, token = _register_and_login(client)
    tz = ZoneInfo("Asia/Shanghai")
    today = _shanghai_today()
    inside = today - timedelta(days=5)
    outside = today - timedelta(days=12)
    samples = []
    for day, values in (
        (today, [(10, 0, 0.93), (10, 30, 0.98), (11, 0, 0.96)]),
        (inside, [(9, 0, 0.98), (10, 0, 0.98)]),
        (outside, [(8, 0, 0.91)]),
    ):
        for hour, minute, value in values:
            at = datetime(day.year, day.month, day.day, hour, minute, tzinfo=tz)
            samples.append(
                {
                    "hk_uuid": str(uuid.uuid4()),
                    "metric_type": "oxygen_saturation",
                    "start_at": at.isoformat(),
                    "end_at": at.isoformat(),
                    "value": value,
                    "unit": "%",
                }
            )
    # Sparse overnight gap should cap at 2h
    sparse_a = datetime(inside.year, inside.month, inside.day, 1, 0, tzinfo=tz)
    sparse_b = datetime(inside.year, inside.month, inside.day, 5, 0, tzinfo=tz)
    samples.extend(
        [
            {
                "hk_uuid": str(uuid.uuid4()),
                "metric_type": "oxygen_saturation",
                "start_at": sparse_a.isoformat(),
                "end_at": sparse_a.isoformat(),
                "value": 0.91,
                "unit": "%",
            },
            {
                "hk_uuid": str(uuid.uuid4()),
                "metric_type": "oxygen_saturation",
                "start_at": sparse_b.isoformat(),
                "end_at": sparse_b.isoformat(),
                "value": 0.91,
                "unit": "%",
            },
        ]
    )
    posted = client.post(
        "/health/sync/samples",
        headers=_headers(token),
        json={"timezone": "Asia/Shanghai", "samples": samples},
    )
    assert posted.status_code == 200, posted.text

    day_resp = client.get(
        f"/views/me/health/cards/spo2?date={today.isoformat()}",
        headers=_headers(token),
    )
    assert day_resp.status_code == 200, day_resp.text
    day_body = day_resp.json()
    day_dates = {row["local_date"] for row in day_body["spo2_days"]}
    assert day_dates == {today.isoformat(), inside.isoformat()}
    assert outside.isoformat() not in day_dates
    assert [row["value"] for row in day_body["samples"]] == [0.93, 0.98, 0.96]

    today_row = next(row for row in day_body["spo2_days"] if row["local_date"] == today.isoformat())
    # avg of 0.93/0.98/0.96 = 0.956… → score clamp(round(100*(0.956-0.90)/0.08))
    assert today_row["score"] == round(100 * (today_row["spo2_avg"] - 0.90) / 0.08)
    assert today_row["spo2_avg"] is not None
    # 0.93→low 30m; 0.98→high 30m; last sample has no trailing duration
    assert today_row["low_minutes"] == 30.0
    assert today_row["high_minutes"] == 30.0
    assert today_row["mid_minutes"] == 0.0
    assert today_row["good_minutes"] == 0.0
    assert abs(today_row["low_ratio"] - 0.5) < 1e-6
    assert abs(today_row["high_ratio"] - 0.5) < 1e-6

    inside_row = next(row for row in day_body["spo2_days"] if row["local_date"] == inside.isoformat())
    # 01:00→05:00 and 05:00→09:00 capped at 2h each (low); 09:00→10:00 = 60m high
    assert inside_row["low_minutes"] == 240.0
    assert inside_row["high_minutes"] == 60.0

    ranged = client.get("/views/me/health/cards/spo2?range=7", headers=_headers(token))
    assert ranged.status_code == 200, ranged.text
    ranged_body = ranged.json()
    assert [row["value"] for row in ranged_body["samples"]] == [0.93, 0.98, 0.96]
    ranged_dates = {row["local_date"] for row in ranged_body["spo2_days"]}
    assert ranged_dates == {today.isoformat(), inside.isoformat()}
    assert outside.isoformat() not in ranged_dates
    assert len(ranged_body["spo2_days"]) == 2

    ranged_30 = client.get("/views/me/health/cards/spo2?range=30", headers=_headers(token))
    assert ranged_30.status_code == 200, ranged_30.text
    dates_30 = {row["local_date"] for row in ranged_30.json()["spo2_days"]}
    assert outside.isoformat() in dates_30
    assert [row["value"] for row in ranged_30.json()["samples"]] == [0.93, 0.98, 0.96]


def test_health_card_detail_active_target_uses_carried_weight():
    client = TestClient(app)
    _, token = _register_and_login(client)
    client.patch(
        "/health/profile",
        headers=_headers(token),
        json={"sex": "male", "age_years": 30, "height_cm": 175},
    )
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
                    "value": 70,
                    "unit": "kg",
                }
            ],
        },
    )
    today = _shanghai_today()
    resp = client.get(f"/views/me/health/cards/active?date={today.isoformat()}", headers=_headers(token))
    assert resp.status_code == 200, resp.text
    assert resp.json()["stats"]["active_target_kcal"] == 659.5
    overview = client.get("/views/me/health", headers=_headers(token))
    assert overview.json()["energy_targets"]["active_target_kcal"] == 659.5


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


def _km_route_points() -> list[dict]:
    """Three points along a meridian, about 1.11 km total."""
    return [
        {"t": 0.0, "lat": 31.230, "lng": 121.470, "alt": 5.0},
        {"t": 400.0, "lat": 31.235, "lng": 121.470, "alt": 8.0},
        {"t": 900.0, "lat": 31.240, "lng": 121.470, "alt": 12.0},
    ]


def test_requires_auth_for_workout_detail():
    client = TestClient(app)
    resp = client.get(f"/views/me/health/workouts/{uuid.uuid4()}")
    assert resp.status_code == 401


def test_workout_detail_running_index_and_owner_scope():
    client = TestClient(app)
    _, token = _register_and_login(client)
    _, other_token = _register_and_login(client)

    saved = client.patch("/health/profile", headers=_headers(token), json={"max_hr_bpm": 188})
    assert saved.status_code == 200, saved.text

    hk = str(uuid.uuid4())
    start = datetime.now(timezone.utc).replace(microsecond=0)
    end = start + timedelta(minutes=25)
    workout = client.post(
        "/health/sync/workouts",
        headers=_headers(token),
        json={
            "timezone": "Asia/Shanghai",
            "workouts": [
                {
                    "hk_uuid": hk,
                    "activity_type": "running",
                    "start_at": start.isoformat(),
                    "end_at": end.isoformat(),
                    "duration_seconds": 1500,
                    "distance_m": 3500,
                    "avg_hr_bpm": 155,
                    "avg_cadence_spm": 170,
                    "avg_pace_sec_per_km": 429,
                }
            ],
        },
    )
    assert workout.status_code == 200, workout.text

    samples = []
    for i, bpm in enumerate((148, 155, 162)):
        at = (start + timedelta(minutes=5 * (i + 1))).isoformat()
        samples.append(
            {
                "hk_uuid": str(uuid.uuid4()),
                "metric_type": "heart_rate",
                "start_at": at,
                "end_at": at,
                "value": bpm,
                "unit": "count/min",
            }
        )
    posted = client.post(
        "/health/sync/samples",
        headers=_headers(token),
        json={"timezone": "Asia/Shanghai", "samples": samples},
    )
    assert posted.status_code == 200, posted.text

    route = client.post(
        "/health/sync/workout-routes",
        headers=_headers(token),
        json={
            "timezone": "Asia/Shanghai",
            "routes": [{"hk_uuid": hk, "points": _km_route_points()}],
        },
    )
    assert route.status_code == 200, route.text

    listing = client.get("/views/me/health", headers=_headers(token))
    assert listing.status_code == 200, listing.text
    workouts = listing.json()["recent_workouts"]
    assert workouts, listing.text
    workout_id = workouts[0]["id"]

    detail = client.get(f"/views/me/health/workouts/{workout_id}", headers=_headers(token))
    assert detail.status_code == 200, detail.text
    body = detail.json()
    assert body["running_index"] is not None
    assert any(row.get("is_total") is True for row in (body.get("splits") or []))

    other = client.get(f"/views/me/health/workouts/{workout_id}", headers=_headers(other_token))
    assert other.status_code == 404
    assert other.json()["detail"] == "not_found"


def test_workout_detail_cadence_from_step_count_interval():
    """step_count intervals convert to SPM: steps / (duration_min)."""
    client = TestClient(app)
    _, token = _register_and_login(client)

    hk = str(uuid.uuid4())
    start = datetime.now(timezone.utc).replace(microsecond=0)
    end = start + timedelta(minutes=10)
    workout = client.post(
        "/health/sync/workouts",
        headers=_headers(token),
        json={
            "timezone": "Asia/Shanghai",
            "workouts": [
                {
                    "hk_uuid": hk,
                    "activity_type": "running",
                    "start_at": start.isoformat(),
                    "end_at": end.isoformat(),
                    "duration_seconds": 600,
                    "distance_m": 1500,
                    "avg_hr_bpm": 150,
                    "avg_cadence_spm": 165,
                }
            ],
        },
    )
    assert workout.status_code == 200, workout.text

    # 85 steps over 30s => 170 SPM. Value 85 is in the old "already SPM" band,
    # so without duration-based conversion the series avg would be ~85, not ~170.
    sample_start = start + timedelta(minutes=2)
    sample_end = sample_start + timedelta(seconds=30)
    posted = client.post(
        "/health/sync/samples",
        headers=_headers(token),
        json={
            "timezone": "Asia/Shanghai",
            "samples": [
                {
                    "hk_uuid": str(uuid.uuid4()),
                    "metric_type": "step_count",
                    "start_at": sample_start.isoformat(),
                    "end_at": sample_end.isoformat(),
                    "value": 85,
                    "unit": "count",
                }
            ],
        },
    )
    assert posted.status_code == 200, posted.text

    listing = client.get("/views/me/health", headers=_headers(token))
    assert listing.status_code == 200, listing.text
    workout_id = listing.json()["recent_workouts"][0]["id"]

    detail = client.get(f"/views/me/health/workouts/{workout_id}", headers=_headers(token))
    assert detail.status_code == 200, detail.text
    cadence = detail.json()["series"]["cadence"]
    assert cadence is not None
    assert abs(cadence["avg"] - 170.0) < 1.0


def test_workout_detail_invalid_id_not_found():
    client = TestClient(app)
    _, token = _register_and_login(client)
    resp = client.get("/views/me/health/workouts/not-a-uuid", headers=_headers(token))
    assert resp.status_code == 404
    assert resp.json()["detail"] == "not_found"


def test_workout_detail_indoor_splits_from_running_speed():
    client = TestClient(app)
    _, token = _register_and_login(client)
    hk = str(uuid.uuid4())
    start = datetime.now(timezone.utc).replace(microsecond=0)
    end = start + timedelta(seconds=800)
    workout = client.post(
        "/health/sync/workouts",
        headers=_headers(token),
        json={
            "timezone": "Asia/Shanghai",
            "workouts": [
                {
                    "hk_uuid": hk,
                    "activity_type": "running",
                    "start_at": start.isoformat(),
                    "end_at": end.isoformat(),
                    "duration_seconds": 800,
                    "distance_m": 2500,
                    "avg_hr_bpm": 150,
                }
            ],
        },
    )
    assert workout.status_code == 200, workout.text

    speed = 10.0 / 3.0
    samples = []
    for i in range(25):
        sample_start = start + timedelta(seconds=i * 30)
        sample_end = sample_start + timedelta(seconds=30)
        samples.append(
            {
                "hk_uuid": str(uuid.uuid4()),
                "metric_type": "running_speed",
                "start_at": sample_start.isoformat(),
                "end_at": sample_end.isoformat(),
                "value": speed,
                "unit": "m/s",
            }
        )
    posted = client.post(
        "/health/sync/samples",
        headers=_headers(token),
        json={"timezone": "Asia/Shanghai", "samples": samples},
    )
    assert posted.status_code == 200, posted.text

    listing = client.get("/views/me/health", headers=_headers(token))
    assert listing.status_code == 200, listing.text
    workout_id = listing.json()["recent_workouts"][0]["id"]

    detail = client.get(f"/views/me/health/workouts/{workout_id}", headers=_headers(token))
    assert detail.status_code == 200, detail.text
    splits = detail.json().get("splits")
    assert splits is not None
    assert any(row.get("is_total") is True for row in splits)
    assert abs(sum(row["distance_m"] for row in splits if not row.get("is_total")) - 2500) < 5


def test_workout_detail_speed_splits_preferred_over_gps():
    """When running_speed exists, km splits follow calibrated speed (not GPS zig-zag)."""
    client = TestClient(app)
    _, token = _register_and_login(client)
    hk = str(uuid.uuid4())
    start = datetime.now(timezone.utc).replace(microsecond=0)
    end = start + timedelta(seconds=800)
    workout = client.post(
        "/health/sync/workouts",
        headers=_headers(token),
        json={
            "timezone": "Asia/Shanghai",
            "workouts": [
                {
                    "hk_uuid": hk,
                    "activity_type": "running",
                    "start_at": start.isoformat(),
                    "end_at": end.isoformat(),
                    "duration_seconds": 800,
                    "distance_m": 2500,
                    "avg_hr_bpm": 150,
                }
            ],
        },
    )
    assert workout.status_code == 200, workout.text

    speed = 10.0 / 3.0
    samples = []
    for i in range(25):
        sample_start = start + timedelta(seconds=i * 30)
        sample_end = sample_start + timedelta(seconds=30)
        samples.append(
            {
                "hk_uuid": str(uuid.uuid4()),
                "metric_type": "running_speed",
                "start_at": sample_start.isoformat(),
                "end_at": sample_end.isoformat(),
                "value": speed,
                "unit": "m/s",
            }
        )
    posted = client.post(
        "/health/sync/samples",
        headers=_headers(token),
        json={"timezone": "Asia/Shanghai", "samples": samples},
    )
    assert posted.status_code == 200, posted.text
    route = client.post(
        "/health/sync/workout-routes",
        headers=_headers(token),
        json={
            "timezone": "Asia/Shanghai",
            "routes": [{"hk_uuid": hk, "points": _km_route_points()}],
        },
    )
    assert route.status_code == 200, route.text

    listing = client.get("/views/me/health", headers=_headers(token))
    workout_id = listing.json()["recent_workouts"][0]["id"]
    detail = client.get(f"/views/me/health/workouts/{workout_id}", headers=_headers(token))
    assert detail.status_code == 200, detail.text
    splits = [row for row in (detail.json().get("splits") or []) if not row.get("is_total")]
    total_m = sum(row["distance_m"] for row in splits)
    assert abs(total_m - 2500) < 5
    total_row = next(row for row in detail.json()["splits"] if row.get("is_total"))
    assert abs(total_row["distance_m"] - 2500) < 1
    assert abs(total_row["duration_seconds"] - 800) < 1

def test_workout_detail_descent_from_route_alts():
    client = TestClient(app)
    _, token = _register_and_login(client)
    hk = str(uuid.uuid4())
    start = datetime.now(timezone.utc).replace(microsecond=0)
    end = start + timedelta(minutes=20)
    workout = client.post(
        "/health/sync/workouts",
        headers=_headers(token),
        json={
            "timezone": "Asia/Shanghai",
            "workouts": [
                {
                    "hk_uuid": hk,
                    "activity_type": "running",
                    "start_at": start.isoformat(),
                    "end_at": end.isoformat(),
                    "duration_seconds": 1200,
                    "distance_m": 1500,
                    "avg_hr_bpm": 150,
                }
            ],
        },
    )
    assert workout.status_code == 200, workout.text
    points = [
        {"t": 0.0, "lat": 31.230, "lng": 121.470, "alt": 10.0},
        {"t": 400.0, "lat": 31.235, "lng": 121.470, "alt": 25.0},
        {"t": 900.0, "lat": 31.240, "lng": 121.470, "alt": 12.0},
    ]
    route = client.post(
        "/health/sync/workout-routes",
        headers=_headers(token),
        json={"timezone": "Asia/Shanghai", "routes": [{"hk_uuid": hk, "points": points}]},
    )
    assert route.status_code == 200, route.text

    listing = client.get("/views/me/health", headers=_headers(token))
    workout_id = listing.json()["recent_workouts"][0]["id"]
    detail = client.get(f"/views/me/health/workouts/{workout_id}", headers=_headers(token))
    assert detail.status_code == 200, detail.text
    body = detail.json()
    assert body["elevation_ascended_m"] > 0
    assert body["elevation_descended_m"] > 0


def test_workout_detail_fills_hr_metrics_from_samples_when_session_avg_missing():
    """Spec §4: HR is session avg or in-window series — index/load must not stay null."""
    client = TestClient(app)
    _, token = _register_and_login(client)
    saved = client.patch("/health/profile", headers=_headers(token), json={"max_hr_bpm": 188})
    assert saved.status_code == 200, saved.text

    hk = str(uuid.uuid4())
    start = datetime.now(timezone.utc).replace(microsecond=0)
    end = start + timedelta(minutes=25)
    workout = client.post(
        "/health/sync/workouts",
        headers=_headers(token),
        json={
            "timezone": "Asia/Shanghai",
            "workouts": [
                {
                    "hk_uuid": hk,
                    "activity_type": "running",
                    "start_at": start.isoformat(),
                    "end_at": end.isoformat(),
                    "duration_seconds": 1500,
                    "distance_m": 3500,
                }
            ],
        },
    )
    assert workout.status_code == 200, workout.text

    samples = []
    for i, bpm in enumerate((148, 155, 162)):
        at = (start + timedelta(minutes=5 * (i + 1))).isoformat()
        samples.append(
            {
                "hk_uuid": str(uuid.uuid4()),
                "metric_type": "heart_rate",
                "start_at": at,
                "end_at": at,
                "value": bpm,
                "unit": "count/min",
            }
        )
    posted = client.post(
        "/health/sync/samples",
        headers=_headers(token),
        json={"timezone": "Asia/Shanghai", "samples": samples},
    )
    assert posted.status_code == 200, posted.text

    listing = client.get("/views/me/health", headers=_headers(token))
    workout_id = listing.json()["recent_workouts"][0]["id"]
    detail = client.get(f"/views/me/health/workouts/{workout_id}", headers=_headers(token))
    assert detail.status_code == 200, detail.text
    body = detail.json()
    assert body["avg_hr_bpm"] is not None
    assert abs(body["avg_hr_bpm"] - 155.0) < 1.0
    assert body["running_index"] is not None
    assert body["training_load"] is not None
    assert body["heart_rate"] is not None
    assert body["heart_rate_zones"]
    assert sum(zone["seconds"] for zone in body["heart_rate_zones"]) > 0


def test_workout_detail_fills_cadence_stride_from_point_step_samples():
    """Instantaneous step_count (start==end) still yields SPM series, avg cadence, and stride."""
    client = TestClient(app)
    _, token = _register_and_login(client)
    hk = str(uuid.uuid4())
    start = datetime.now(timezone.utc).replace(microsecond=0)
    end = start + timedelta(minutes=10)
    workout = client.post(
        "/health/sync/workouts",
        headers=_headers(token),
        json={
            "timezone": "Asia/Shanghai",
            "workouts": [
                {
                    "hk_uuid": hk,
                    "activity_type": "running",
                    "start_at": start.isoformat(),
                    "end_at": end.isoformat(),
                    "duration_seconds": 600,
                    "distance_m": 1500,
                }
            ],
        },
    )
    assert workout.status_code == 200, workout.text

    samples = []
    for i in range(3):
        at = start + timedelta(seconds=30 * (i + 1))
        samples.append(
            {
                "hk_uuid": str(uuid.uuid4()),
                "metric_type": "step_count",
                "start_at": at.isoformat(),
                "end_at": at.isoformat(),
                "value": 85,
                "unit": "count",
            }
        )
        samples.append(
            {
                "hk_uuid": str(uuid.uuid4()),
                "metric_type": "running_stride",
                "start_at": at.isoformat(),
                "end_at": at.isoformat(),
                "value": 1.12,
                "unit": "m",
            }
        )
        samples.append(
            {
                "hk_uuid": str(uuid.uuid4()),
                "metric_type": "running_vertical_oscillation",
                "start_at": at.isoformat(),
                "end_at": at.isoformat(),
                "value": 82,
                "unit": "mm",
            }
        )
    posted = client.post(
        "/health/sync/samples",
        headers=_headers(token),
        json={"timezone": "Asia/Shanghai", "samples": samples},
    )
    assert posted.status_code == 200, posted.text

    listing = client.get("/views/me/health", headers=_headers(token))
    workout_id = listing.json()["recent_workouts"][0]["id"]
    detail = client.get(f"/views/me/health/workouts/{workout_id}", headers=_headers(token))
    assert detail.status_code == 200, detail.text
    body = detail.json()
    assert body["avg_cadence_spm"] is not None
    assert abs(body["avg_cadence_spm"] - 170.0) < 5.0
    assert body["stride_m"] is not None
    assert abs(body["stride_m"] - 1.12) < 0.02
    series = body["series"]
    assert series["cadence"] is not None
    assert series["stride"] is not None
    assert series["vertical_oscillation"] is not None


def test_health_card_detail_exercise_range_averages_and_lists_window():
    client = TestClient(app)
    _, token = _register_and_login(client)
    tz = ZoneInfo("Asia/Shanghai")
    today = _shanghai_today()
    earlier = today - timedelta(days=2)

    def exercise_sample(local_day: date, minutes: float) -> dict:
        start = datetime(local_day.year, local_day.month, local_day.day, 9, 0, tzinfo=tz)
        end = start + timedelta(minutes=int(minutes))
        return {
            "hk_uuid": str(uuid.uuid4()),
            "metric_type": "exercise_time",
            "start_at": start.isoformat(),
            "end_at": end.isoformat(),
            "value": minutes,
            "unit": "min",
        }

    def workout(local_day: date, *, hour: int, duration_minutes: int) -> dict:
        start = datetime(local_day.year, local_day.month, local_day.day, hour, 0, tzinfo=tz)
        end = start + timedelta(minutes=duration_minutes)
        return {
            "hk_uuid": str(uuid.uuid4()),
            "activity_type": "running",
            "start_at": start.isoformat(),
            "end_at": end.isoformat(),
            "duration_seconds": duration_minutes * 60,
        }

    posted = client.post(
        "/health/sync/samples",
        headers=_headers(token),
        json={
            "timezone": "Asia/Shanghai",
            "samples": [
                exercise_sample(earlier, 20),
                exercise_sample(today, 40),
            ],
        },
    )
    assert posted.status_code == 200, posted.text
    workouts = client.post(
        "/health/sync/workouts",
        headers=_headers(token),
        json={
            "timezone": "Asia/Shanghai",
            "workouts": [
                workout(earlier, hour=8, duration_minutes=30),
                workout(today, hour=18, duration_minutes=60),
            ],
        },
    )
    assert workouts.status_code == 200, workouts.text

    day = client.get(
        f"/views/me/health/cards/exercise?date={today.isoformat()}",
        headers=_headers(token),
    )
    assert day.status_code == 200, day.text
    day_body = day.json()
    assert day_body["mode"] == "day"
    assert day_body["stats"]["exercise_minutes"] == 40
    assert day_body["stats"]["workout_minutes"] == 60
    assert len(day_body["workouts"]) == 1

    ranged = client.get("/views/me/health/cards/exercise?range=7", headers=_headers(token))
    assert ranged.status_code == 200, ranged.text
    body = ranged.json()
    assert body["mode"] == "range"
    assert body["stats"]["exercise_minutes"] == 30
    # Two daily rows with workouts 30 + 60 → average 45
    assert body["stats"]["workout_minutes"] == 45
    assert len(body["workouts"]) == 2

    overview = client.get("/views/me/health?range=7", headers=_headers(token))
    assert overview.status_code == 200, overview.text
    assert overview.json()["current"]["exercise_minutes"] == 30
    assert overview.json()["totals"]["exercise_minutes"] == 60



def test_health_sync_checkpoint_advances_watermark_without_run():
    client = TestClient(app)
    _, token = _register_and_login(client)
    to_at = datetime.now(timezone.utc).isoformat()
    resp = client.post(
        "/health/sync/checkpoint",
        headers=_headers(token),
        json={"to_at": to_at},
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["last_synced_at"] is not None
    status = client.get("/health/sync-status", headers=_headers(token))
    assert status.status_code == 200, status.text
    assert status.json()["last_synced_at"] is not None
    assert status.json()["runs"] == []


def test_clear_health_data_keeps_profile_and_resets_watermark():
    client = TestClient(app)
    _, token = _register_and_login(client)
    now = datetime.now(timezone.utc)
    synced = client.post(
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
                    "value": 500,
                    "unit": "count",
                }
            ],
        },
    )
    assert synced.status_code == 200, synced.text
    profile = client.patch(
        "/health/profile",
        headers=_headers(token),
        json={"sex": "male", "age_years": 30, "height_cm": 175, "max_hr_bpm": 190},
    )
    assert profile.status_code == 200, profile.text
    run = client.post(
        "/health/sync/runs",
        headers=_headers(token),
        json={
            "source": "manual",
            "status": "success",
            "to_at": now.isoformat(),
            "quantity_count": 1,
            "upserted": 1,
            "local_dates": synced.json()["local_dates"],
        },
    )
    assert run.status_code == 200, run.text

    cleared = client.delete("/health/data", headers=_headers(token))
    assert cleared.status_code == 200, cleared.text
    body = cleared.json()
    assert body["quantity_deleted"] >= 1
    assert body["sync_run_deleted"] >= 1
    assert body["sync_state_cleared"] is True

    status = client.get("/health/sync-status", headers=_headers(token))
    assert status.status_code == 200, status.text
    assert status.json()["last_synced_at"] is None
    assert status.json()["runs"] == []
    assert all(day["quantity_count"] == 0 for day in status.json()["days"]) or status.json()["days"] == []

    kept = client.get("/health/profile", headers=_headers(token))
    assert kept.status_code == 200, kept.text
    assert kept.json()["height_cm"] == 175
    assert kept.json()["max_hr_bpm"] == 190

    overview = client.get("/views/me/health", headers=_headers(token))
    assert overview.status_code == 200, overview.text


def test_health_sync_samples_accepts_gzip_body():
    client = TestClient(app)
    _, token = _register_and_login(client)
    now = datetime.now(timezone.utc).isoformat()
    payload = {
        "timezone": "Asia/Shanghai",
        "samples": [
            {
                "hk_uuid": str(uuid.uuid4()),
                "metric_type": "step_count",
                "start_at": now,
                "end_at": now,
                "value": 100,
                "unit": "count",
            }
        ],
    }
    compressed = gzip.compress(json.dumps(payload).encode("utf-8"))
    resp = client.post(
        "/health/sync/samples",
        headers={
            **_headers(token),
            "Content-Type": "application/json",
            "Content-Encoding": "gzip",
        },
        content=compressed,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["upserted"] == 1


def test_health_sync_samples_rejects_bad_gzip():
    client = TestClient(app)
    _, token = _register_and_login(client)
    resp = client.post(
        "/health/sync/samples",
        headers={
            **_headers(token),
            "Content-Type": "application/json",
            "Content-Encoding": "gzip",
        },
        content=b"not-gzip",
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "content_encoding_invalid"
