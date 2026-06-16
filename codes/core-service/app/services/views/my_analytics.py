"""My analytics view — aggregates schedule scope for current user."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.models.user import User
from app.schemas.views.analytics import MyAnalyticsViewOut
from app.services.views.schedule_items import ScheduleScope, build_my_schedule_dashboard, list_schedule_items


def build_my_analytics(db: Session, user: User) -> MyAnalyticsViewOut:
    items = list_schedule_items(db, user, ScheduleScope(kind="me"))
    base = build_my_schedule_dashboard(db, user, items)
    high = sum(1 for it in items if (it.priority or "").strip().lower() in ("4", "high"))

    return MyAnalyticsViewOut(
        display_name=base["display_name"],
        email=base["email"],
        task_total=base["task_total"],
        todo_count=base["todo_count"],
        doing_count=base["doing_count"],
        done_count=base["done_count"],
        archived_count=base["archived_count"],
        high_priority_count=high,
        health_percent=base["health_percent"],
        workspace_count=base["workspace_count"],
        project_count=base["project_count"],
    )
