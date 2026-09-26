from __future__ import annotations

from typing import Any

from timia_mcp.http_client import TimiaHttpClient

_WORKOUT_KEYS = (
    "id",
    "activity_type",
    "start_at",
    "end_at",
    "duration_seconds",
    "distance_m",
    "avg_hr_bpm",
    "active_energy_kcal",
)
_DETAIL_EXTRA = (
    "stride_m",
    "running_index",
    "training_load",
    "trimp",
    "rtss",
)


def trim_workout(row: dict[str, Any]) -> dict[str, Any]:
    return {key: row[key] for key in _WORKOUT_KEYS if key in row}


async def get_health_summary_impl(
    client: TimiaHttpClient,
    selected_date: str | None = None,
    range_days: int | None = None,
) -> dict[str, Any]:
    params: dict[str, Any] = {}
    if selected_date is not None:
        params["date"] = selected_date
    if range_days is not None:
        params["range"] = range_days
    data = await client.request("GET", "/views/me/health", params=params or None)
    insight = data.get("insight")
    if isinstance(insight, dict):
        insight = {
            key: insight[key] for key in ("local_date", "status", "summary") if key in insight
        }
    recent = data.get("recent_workouts") or []
    return {
        "timezone": data.get("timezone"),
        "mode": data.get("mode"),
        "selected_date": data.get("selected_date"),
        "current": data.get("current"),
        "scores": data.get("scores"),
        "insight": insight,
        "recent_workouts": [trim_workout(row) for row in recent[:5]],
    }


async def list_workouts_impl(
    client: TimiaHttpClient,
    end: str | None = None,
    days: int | None = None,
) -> dict[str, Any]:
    params: dict[str, Any] = {}
    if end is not None:
        params["end"] = end
    if days is not None:
        params["days"] = days
    data = await client.request("GET", "/views/me/health/workouts", params=params or None)
    workouts = data.get("workouts") or []
    return {
        "timezone": data.get("timezone"),
        "start_date": data.get("start_date"),
        "end_date": data.get("end_date"),
        "has_more": data.get("has_more", False),
        "workouts": [trim_workout(row) for row in workouts],
    }


async def get_workout_impl(client: TimiaHttpClient, workout_id: str) -> dict[str, Any]:
    data = await client.request("GET", f"/views/me/health/workouts/{workout_id}")
    out = trim_workout(data)
    for key in _DETAIL_EXTRA:
        if key in data:
            out[key] = data[key]
    route = data.get("route") or {}
    points = route.get("points") if isinstance(route, dict) else None
    out["route_point_count"] = len(points) if isinstance(points, list) else 0
    splits = data.get("splits") or []
    out["splits"] = splits[:12]
    return out


async def get_health_metric_impl(
    client: TimiaHttpClient,
    metric: str,
    selected_date: str | None = None,
    range_days: int | None = None,
) -> dict[str, Any]:
    params: dict[str, Any] = {}
    if selected_date is not None:
        params["date"] = selected_date
    if range_days is not None:
        params["range"] = range_days
    data = await client.request(
        "GET", f"/views/me/health/cards/{metric}", params=params or None
    )
    hourly = data.get("hourly") or []
    samples = data.get("samples") or []
    return {
        "metric": data.get("metric"),
        "timezone": data.get("timezone"),
        "mode": data.get("mode"),
        "focus_date": data.get("focus_date"),
        "range_start": data.get("range_start"),
        "range_end": data.get("range_end"),
        "stats": data.get("stats"),
        "hourly": hourly[:48],
        "sample_count": len(samples),
    }
