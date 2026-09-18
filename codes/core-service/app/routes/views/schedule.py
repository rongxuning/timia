import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.deps import get_db
from app.models.user import User
from app.schemas.views.schedule import (
    MyScheduleDashboardOut,
    NaturalLanguageParseOut,
    NaturalLanguageParseRequest,
    ScheduleCalendarViewOut,
    ScheduleFutureViewOut,
    ScheduleMapViewOut,
    ScheduleOverdueViewOut,
    SchedulePriorityViewOut,
    ScheduleSwimlaneViewOut,
    ScheduleUndatedViewOut,
)
from app.services.natural_language_schedule import (
    NaturalLanguageConfigurationError,
    NaturalLanguageProviderError,
    parse_natural_language_task,
)
from app.services.views.schedule_items import (
    ScheduleScope,
    anchor_default,
    build_my_schedule_dashboard,
    list_schedule_items,
    parse_anchor,
    parse_involvement,
    parse_month,
)
from app.services.views.schedule_layout import (
    DEFAULT_CALENDAR_TIMEZONE,
    build_calendar_view,
    build_future_view,
    build_overdue_view,
    build_priority_view,
    build_swimlane_view,
    build_undated_view,
)
from app.services.views.schedule_map import build_map_view, parse_map_statuses

router = APIRouter(prefix="/views/schedule", tags=["views-schedule"])


def _resolve_scope(
    scope: str,
    workspace_id: uuid.UUID | None,
    project_id: uuid.UUID | None,
    involvement: str | None = None,
) -> ScheduleScope:
    try:
        parsed_involvement = parse_involvement(involvement)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error
    if scope == "me":
        return ScheduleScope(kind="me", involvement=parsed_involvement)
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
    view: str = Query("month", pattern="^(year|month|week|day)$"),
    anchor: str | None = None,
    month: str | None = None,
    timezone_name: str = Query(
        DEFAULT_CALENDAR_TIMEZONE,
        alias="timezone",
        min_length=1,
        max_length=100,
    ),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    resolved = _resolve_scope(scope, workspace_id, project_id)
    items = list_schedule_items(db, user, resolved)

    anchor_date = None
    if anchor:
        try:
            anchor_date = parse_anchor(anchor)
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    elif month:
        try:
            year, mon = parse_month(month)
            anchor_date = date(year, mon, 1)
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e
    else:
        try:
            anchor_date = parse_anchor(anchor_default())
        except ValueError as e:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(e)) from e

    try:
        return build_calendar_view(
            items,
            view=view,
            anchor=anchor_date,
            timezone_name=timezone_name,
        )
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error


@router.get("/map", response_model=ScheduleMapViewOut)
def schedule_map_view(
    scope: str = Query("me", pattern="^(me|project)$"),
    workspace_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    statuses: list[str] | None = Query(None, alias="status"),
    limit: int = Query(500, ge=1, le=500),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if scope != "me":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="map_scope_unsupported")
    if project_id is not None and workspace_id is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="project_id_requires_workspace_id",
        )
    try:
        parsed_statuses = parse_map_statuses(statuses)
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error
    resolved = _resolve_scope(scope, workspace_id, project_id)
    items = list_schedule_items(db, user, resolved)
    return build_map_view(
        items,
        statuses=parsed_statuses,
        workspace_id=str(workspace_id) if workspace_id else None,
        project_id=str(project_id) if project_id else None,
        limit=limit,
    )


@router.post("/natural-language/parse", response_model=NaturalLanguageParseOut)
def parse_schedule_natural_language(
    payload: NaturalLanguageParseRequest,
    _: User = Depends(get_current_user),
):
    try:
        return parse_natural_language_task(payload)
    except NaturalLanguageConfigurationError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(error),
        ) from error
    except NaturalLanguageProviderError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=str(error),
        ) from error


@router.get("/swimlane", response_model=ScheduleSwimlaneViewOut)
def schedule_swimlane_view(
    scope: str = Query("me", pattern="^(me|project)$"),
    workspace_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    task_status: str | None = Query(None, alias="status", pattern="^(todo|doing|done|archived)$"),
    limit: int = Query(10, ge=1, le=50),
    offset: int = Query(0, ge=0),
    completed_limit: int = Query(5, ge=1, le=20),
    active_limit: int | None = Query(None, ge=1, le=50),
    anchor: str | None = None,
    involvement: str | None = Query(None, pattern="^(assignee|participant|any)$"),
    timezone_name: str = Query(
        DEFAULT_CALENDAR_TIMEZONE,
        alias="timezone",
        min_length=1,
        max_length=100,
    ),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    resolved = _resolve_scope(scope, workspace_id, project_id, involvement)
    items = list_schedule_items(db, user, resolved)
    day = None
    if anchor:
        try:
            day = parse_anchor(anchor)
        except ValueError as error:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error
    try:
        return build_swimlane_view(
            items,
            task_status=task_status,
            limit=limit,
            offset=offset,
            completed_limit=completed_limit,
            active_limit=active_limit,
            day=day,
            timezone_name=timezone_name,
        )
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error


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


@router.get("/undated", response_model=ScheduleUndatedViewOut)
def schedule_undated_view(
    scope: str = Query("me", pattern="^(me|project)$"),
    workspace_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    involvement: str | None = Query(None, pattern="^(assignee|participant|any)$"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    resolved = _resolve_scope(scope, workspace_id, project_id, involvement)
    items = list_schedule_items(db, user, resolved)
    return build_undated_view(items)


@router.get("/overdue", response_model=ScheduleOverdueViewOut)
def schedule_overdue_view(
    scope: str = Query("me", pattern="^(me|project)$"),
    workspace_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    timezone_name: str = Query(
        DEFAULT_CALENDAR_TIMEZONE,
        alias="timezone",
        min_length=1,
        max_length=100,
    ),
    limit: int = Query(10, ge=1, le=50),
    offset: int = Query(0, ge=0),
    involvement: str | None = Query(None, pattern="^(assignee|participant|any)$"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    resolved = _resolve_scope(scope, workspace_id, project_id, involvement)
    items = list_schedule_items(db, user, resolved)
    try:
        return build_overdue_view(
            items,
            timezone_name=timezone_name,
            limit=limit,
            offset=offset,
        )
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error


@router.get("/future", response_model=ScheduleFutureViewOut)
def schedule_future_view(
    scope: str = Query("me", pattern="^(me|project)$"),
    workspace_id: uuid.UUID | None = None,
    project_id: uuid.UUID | None = None,
    timezone_name: str = Query(
        DEFAULT_CALENDAR_TIMEZONE,
        alias="timezone",
        min_length=1,
        max_length=100,
    ),
    limit: int = Query(10, ge=1, le=50),
    offset: int = Query(0, ge=0),
    involvement: str | None = Query(None, pattern="^(assignee|participant|any)$"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    resolved = _resolve_scope(scope, workspace_id, project_id, involvement)
    items = list_schedule_items(db, user, resolved)
    try:
        return build_future_view(
            items,
            timezone_name=timezone_name,
            limit=limit,
            offset=offset,
        )
    except ValueError as error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(error)) from error


@router.get("/dashboard", response_model=MyScheduleDashboardOut)
def my_schedule_dashboard(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    items = list_schedule_items(db, user, ScheduleScope(kind="me"))
    return build_my_schedule_dashboard(db, user, items)
