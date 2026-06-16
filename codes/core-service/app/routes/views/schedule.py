import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.deps import get_db
from app.models.user import User
from app.schemas.views.schedule import (
    MyScheduleDashboardOut,
    ScheduleCalendarViewOut,
    SchedulePriorityViewOut,
    ScheduleSwimlaneViewOut,
)
from app.services.views.schedule_items import (
    ScheduleScope,
    build_my_schedule_dashboard,
    list_schedule_items,
    month_default,
    parse_month,
)
from app.services.views.schedule_layout import (
    build_calendar_view,
    build_priority_view,
    build_swimlane_view,
)

router = APIRouter(prefix="/views/schedule", tags=["views-schedule"])


def _resolve_scope(
    scope: str,
    workspace_id: uuid.UUID | None,
    project_id: uuid.UUID | None,
) -> ScheduleScope:
    if scope == "me":
        return ScheduleScope(kind="me")
    if scope == "project":
        if workspace_id is None or project_id is None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="workspace_id and project_id required for project scope",
            )
        return ScheduleScope(kind="project", workspace_id=workspace_id, project_id=project_id)
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_scope")


@router.get("/calendar", response_model=ScheduleCalendarViewOut)
def schedule_calendar_view(
    scope: str = Query("me", pattern="^(me|project)$"),
    workspace_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    month: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    resolved = _resolve_scope(scope, workspace_id, project_id)
    items = list_schedule_items(db, user, resolved)
    month_str = month or month_default()
    try:
        year, mon = parse_month(month_str)
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    return build_calendar_view(items, year, mon)


@router.get("/swimlane", response_model=ScheduleSwimlaneViewOut)
def schedule_swimlane_view(
    scope: str = Query("me", pattern="^(me|project)$"),
    workspace_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    resolved = _resolve_scope(scope, workspace_id, project_id)
    items = list_schedule_items(db, user, resolved)
    return build_swimlane_view(items)


@router.get("/priority", response_model=SchedulePriorityViewOut)
def schedule_priority_view(
    scope: str = Query("me", pattern="^(me|project)$"),
    workspace_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    resolved = _resolve_scope(scope, workspace_id, project_id)
    items = list_schedule_items(db, user, resolved)
    return build_priority_view(items)


@router.get("/dashboard", response_model=MyScheduleDashboardOut)
def my_schedule_dashboard(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    items = list_schedule_items(db, user, ScheduleScope(kind="me"))
    return build_my_schedule_dashboard(db, user, items)
