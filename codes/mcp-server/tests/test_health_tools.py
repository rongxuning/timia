import respx
from httpx import Response

from timia_mcp.tools.health import (
    get_health_metric_impl,
    get_health_summary_impl,
    get_workout_impl,
    list_workouts_impl,
)


@respx.mock
async def test_health_summary_drops_series(client):
    route = respx.get("http://timia.test/views/me/health").mock(
        return_value=Response(
            200,
            json={
                "timezone": "Asia/Shanghai",
                "mode": "day",
                "selected_date": "2026-09-26",
                "current": {"steps": 1000},
                "scores": {"activity": 70},
                "insight": {
                    "local_date": "2026-09-26",
                    "status": "success",
                    "summary": "走得不少",
                    "trends": ["up"],
                },
                "recent_workouts": [
                    {
                        "id": f"w{i}",
                        "activity_type": "running",
                        "start_at": "2026-09-26T01:00:00Z",
                        "end_at": "2026-09-26T01:30:00Z",
                        "duration_seconds": 1800,
                        "distance_m": 5000,
                        "avg_hr_bpm": 140,
                        "location_city": "Shanghai",
                    }
                    for i in range(6)
                ],
                "series": {"steps": [{"local_date": "2026-09-26", "value": 1}]},
                "hourly": {"steps": []},
                "calendar_days": [],
            },
        )
    )
    out = await get_health_summary_impl(client, selected_date="2026-09-26")
    assert route.calls.last.request.url.params["date"] == "2026-09-26"
    assert "series" not in out
    assert "hourly" not in out
    assert len(out["recent_workouts"]) == 5
    assert "location_city" not in out["recent_workouts"][0]
    assert out["insight"]["summary"] == "走得不少"
    assert "trends" not in out["insight"]


@respx.mock
async def test_list_workouts_query(client):
    route = respx.get("http://timia.test/views/me/health/workouts").mock(
        return_value=Response(
            200,
            json={
                "timezone": "Asia/Shanghai",
                "start_date": "2026-09-20",
                "end_date": "2026-09-26",
                "days": 7,
                "has_more": False,
                "workouts": [
                    {
                        "id": "w1",
                        "activity_type": "walking",
                        "start_at": "2026-09-26T01:00:00Z",
                        "end_at": "2026-09-26T01:20:00Z",
                        "duration_seconds": 1200,
                    }
                ],
            },
        )
    )
    out = await list_workouts_impl(client, end="2026-09-26", days=7)
    assert route.calls.last.request.url.params["end"] == "2026-09-26"
    assert out["workouts"][0]["activity_type"] == "walking"


@respx.mock
async def test_get_workout_caps_route(client):
    points = [{"t": i, "lat": 1.0, "lng": 2.0} for i in range(30)]
    respx.get("http://timia.test/views/me/health/workouts/w1").mock(
        return_value=Response(
            200,
            json={
                "id": "w1",
                "activity_type": "running",
                "start_at": "2026-09-26T01:00:00Z",
                "end_at": "2026-09-26T02:00:00Z",
                "duration_seconds": 3600,
                "distance_m": 10000,
                "training_load": 40,
                "route": {"points": points, "km_markers": []},
                "splits": [{"lap": i} for i in range(20)],
                "series": {"pace": {"points": points}},
                "heart_rate": {"points": points},
            },
        )
    )
    out = await get_workout_impl(client, "w1")
    assert out["route_point_count"] == 30
    assert "points" not in out
    assert len(out["splits"]) == 12
    assert "series" not in out
    assert "heart_rate" not in out
    assert out["training_load"] == 40


@respx.mock
async def test_get_health_metric_caps_hourly(client):
    respx.get("http://timia.test/views/me/health/cards/steps").mock(
        return_value=Response(
            200,
            json={
                "metric": "steps",
                "timezone": "Asia/Shanghai",
                "mode": "day",
                "focus_date": "2026-09-26",
                "range_start": None,
                "range_end": None,
                "stats": {"total": 8000},
                "hourly": [{"hour": i, "value": i} for i in range(60)],
                "samples": [{"at": "t", "value": 1}] * 3,
                "sleep_nights": [{"start_at": "x"}],
            },
        )
    )
    out = await get_health_metric_impl(client, "steps")
    assert len(out["hourly"]) == 48
    assert out["sample_count"] == 3
    assert "sleep_nights" not in out
