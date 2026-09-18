"""Filter schedule items that have coordinates for the map view."""

from __future__ import annotations

from app.schemas.views.schedule import ScheduleMapItemOut, ScheduleMapViewOut, ScheduleTaskItemOut

MAP_STATUSES = frozenset({"todo", "doing", "done", "archived"})
DEFAULT_MAP_STATUSES = ("todo", "doing")


def parse_map_statuses(values: list[str] | None) -> tuple[str, ...]:
    if not values:
        return DEFAULT_MAP_STATUSES
    seen: set[str] = set()
    ordered: list[str] = []
    for value in values:
        if value not in MAP_STATUSES:
            raise ValueError("invalid_status")
        if value not in seen:
            seen.add(value)
            ordered.append(value)
    return tuple(ordered) if ordered else DEFAULT_MAP_STATUSES


def _sort_key(item: ScheduleTaskItemOut) -> tuple[int, float, str]:
    if item.start_at is None:
        return (1, 0.0, item.id)
    return (0, -item.start_at.timestamp(), item.id)


def build_map_view(
    items: list[ScheduleTaskItemOut],
    *,
    statuses: tuple[str, ...],
    workspace_id: str | None = None,
    project_id: str | None = None,
    limit: int = 500,
) -> ScheduleMapViewOut:
    status_set = set(statuses)
    matched: list[ScheduleTaskItemOut] = []
    for item in items:
        if item.location_lat is None or item.location_lng is None:
            continue
        if item.status not in status_set:
            continue
        if workspace_id and item.workspace_id != workspace_id:
            continue
        if project_id and item.project_id != project_id:
            continue
        matched.append(item)
    matched.sort(key=_sort_key)
    total = len(matched)
    sliced = matched[:limit]
    return ScheduleMapViewOut(
        items=[ScheduleMapItemOut(**row.model_dump()) for row in sliced],
        total=total,
        truncated=total > limit,
    )
