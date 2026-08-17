from __future__ import annotations

import uuid
from datetime import date, datetime, timezone as dt_timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models._mixins import utcnow
from app.models.item import Item
from app.models.plan import (
    PlanApplyRun,
    PlanSlot,
    PlanSubscription,
    PlanSubscriptionSegment,
    PlanTemplate,
)
from app.models.user import User
from app.schemas.plan import PlanApplyRunOut, PlanSubscribeOut
from app.services.activity import log_activity
from app.services.permissions import require_project_content_access
from app.services.plan_api import require_plan_visible
from app.services.plan_time import (
    current_period_start,
    resolve_slot_bounds,
    resolve_timezone,
    sunday_week_start,
)

DEFAULT_APPLY_TIMEZONE = "Asia/Shanghai"


def canonical_period_start(period_kind: str, period_start: date) -> date:
    if period_kind == "week":
        return sunday_week_start(period_start)
    if period_kind == "month":
        return date(period_start.year, period_start.month, 1)
    if period_kind == "year":
        return date(period_start.year, 1, 1)
    return period_start


def _require_timezone(timezone_name: str) -> None:
    try:
        resolve_timezone(timezone_name)
    except ValueError as error:
        if str(error) == "invalid timezone":
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_timezone"
            ) from error
        raise


def _count_run_items(db: Session, run_id: uuid.UUID) -> int:
    return int(
        db.scalar(
            select(func.count()).select_from(Item).where(Item.source_plan_apply_run_id == run_id)
        )
        or 0
    )


def build_apply_run_out(db: Session, run: PlanApplyRun) -> PlanApplyRunOut:
    return PlanApplyRunOut(
        id=str(run.id),
        template_id=str(run.template_id),
        template_version=run.template_version,
        workspace_id=str(run.workspace_id),
        project_id=str(run.project_id),
        source=run.source,
        period_start=run.period_start,
        period_kind=run.period_kind,
        status=run.status,
        skipped_slots=list(run.skipped_slots or []),
        item_count=_count_run_items(db, run.id),
        applied_at=run.applied_at,
    )


def materialize_run(
    db: Session,
    run: PlanApplyRun,
    timezone_name: str = DEFAULT_APPLY_TIMEZONE,
) -> PlanApplyRun:
    """Create items for an apply run. Does not commit (subscribe reuses this)."""
    _require_timezone(timezone_name)
    template = db.get(PlanTemplate, run.template_id)
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
    slots = list(
        db.scalars(
            select(PlanSlot)
            .where(PlanSlot.template_id == template.id)
            .order_by(PlanSlot.sort_index, PlanSlot.created_at)
        ).all()
    )
    skipped: list[dict[str, str]] = []
    created = 0
    for slot in slots:
        try:
            bounds = resolve_slot_bounds(
                period_kind=run.period_kind,
                period_start=run.period_start,
                rel_month=slot.rel_month,
                rel_day=slot.rel_day,
                start_minute=slot.start_minute,
                end_minute=slot.end_minute,
                all_day=slot.all_day,
                timezone_name=timezone_name,
            )
        except ValueError as error:
            if str(error) == "invalid timezone":
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_timezone"
                ) from error
            raise
        if bounds is None:
            skipped.append({"slot_id": str(slot.id), "reason": "invalid_day"})
            continue
        start_at, end_at = bounds
        db.add(
            Item(
                workspace_id=run.workspace_id,
                project_id=run.project_id,
                title=slot.title,
                body=slot.body,
                color=(slot.color or "#FFFFFF").upper(),
                status="todo",
                priority=slot.priority,
                start_at=start_at,
                end_at=end_at,
                details=slot.details,
                created_by_user_id=run.actor_user_id,
                assignee_user_id=run.actor_user_id,
                participant_user_ids=[],
                location=slot.location,
                version=1,
                source_plan_template_id=template.id,
                source_plan_slot_id=slot.id,
                source_plan_apply_run_id=run.id,
            )
        )
        created += 1
    if created == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="empty_template")
    run.skipped_slots = skipped
    run.status = "applied"
    run.applied_at = utcnow()
    template.use_count += 1
    log_activity(
        db,
        workspace_id=run.workspace_id,
        actor_user_id=run.actor_user_id,
        entity_type="plan_apply_run",
        entity_id=run.id,
        action="apply_plan",
        metadata={
            "template_id": str(template.id),
            "item_count": created,
            "period_start": run.period_start.isoformat(),
        },
    )
    db.flush()
    return run


def apply_one_shot(
    db: Session,
    user: User,
    template_id: uuid.UUID,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    period_start: date,
) -> PlanApplyRun:
    require_project_content_access(db, workspace_id, project_id, user)
    template = require_plan_visible(db, db.get(PlanTemplate, template_id), user)
    if template.usage_kind != "one_shot":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="wrong_usage_kind")
    period_start = canonical_period_start(template.period_kind, period_start)
    existing = db.scalar(
        select(PlanApplyRun).where(
            PlanApplyRun.actor_user_id == user.id,
            PlanApplyRun.template_id == template.id,
            PlanApplyRun.project_id == project_id,
            PlanApplyRun.period_start == period_start,
            PlanApplyRun.source == "one_shot",
            PlanApplyRun.status == "applied",
        )
    )
    if existing is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="already_applied")

    run = PlanApplyRun(
        template_id=template.id,
        template_version=template.version,
        actor_user_id=user.id,
        workspace_id=workspace_id,
        project_id=project_id,
        source="one_shot",
        period_start=period_start,
        period_kind=template.period_kind,
        status="applied",
        skipped_slots=[],
    )
    db.add(run)
    try:
        db.flush()
        materialize_run(db, run)
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as error:
        db.rollback()
        orig = str(getattr(error, "orig", error))
        if "uq_plan_apply_one_shot_applied" in orig:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="already_applied"
            ) from error
        raise
    db.refresh(run)
    return run


def _open_segment(db: Session, subscription_id: uuid.UUID) -> PlanSubscriptionSegment | None:
    return db.scalar(
        select(PlanSubscriptionSegment).where(
            PlanSubscriptionSegment.subscription_id == subscription_id,
            PlanSubscriptionSegment.ended_at.is_(None),
        )
    )


def _applied_run_for_period(
    db: Session, subscription_id: uuid.UUID, period_start: date
) -> PlanApplyRun | None:
    return db.scalar(
        select(PlanApplyRun).where(
            PlanApplyRun.subscription_id == subscription_id,
            PlanApplyRun.period_start == period_start,
            PlanApplyRun.status == "applied",
        )
    )


def _require_run_actor(db: Session, user: User, run: PlanApplyRun) -> None:
    if run.actor_user_id == user.id:
        return
    if run.subscription_id is not None:
        subscription = db.get(PlanSubscription, run.subscription_id)
        if subscription is not None and subscription.subscriber_user_id == user.id:
            return
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")


def _require_pending_run(db: Session, user: User, run_id: uuid.UUID) -> PlanApplyRun:
    run = db.get(PlanApplyRun, run_id)
    if run is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
    _require_run_actor(db, user, run)
    if run.status != "pending":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="run_not_pending")
    return run


def _run_timezone(db: Session, run: PlanApplyRun) -> str:
    if run.subscription_id is None:
        return DEFAULT_APPLY_TIMEZONE
    subscription = db.get(PlanSubscription, run.subscription_id)
    if subscription is None or not subscription.timezone:
        return DEFAULT_APPLY_TIMEZONE
    return subscription.timezone


def subscribe_plan(
    db: Session,
    user: User,
    template_id: uuid.UUID,
    workspace_id: uuid.UUID,
    project_id: uuid.UUID,
    timezone: str,
    now: datetime | None = None,
) -> PlanSubscribeOut:
    require_project_content_access(db, workspace_id, project_id, user)
    template = require_plan_visible(db, db.get(PlanTemplate, template_id), user)
    if template.usage_kind != "subscription":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="wrong_usage_kind")
    _require_timezone(timezone)

    subscription = db.scalar(
        select(PlanSubscription).where(
            PlanSubscription.template_id == template.id,
            PlanSubscription.subscriber_user_id == user.id,
            PlanSubscription.project_id == project_id,
        )
    )
    if subscription is None:
        subscription = PlanSubscription(
            template_id=template.id,
            subscriber_user_id=user.id,
            workspace_id=workspace_id,
            project_id=project_id,
            timezone=timezone,
        )
        db.add(subscription)
        db.flush()

    if _open_segment(db, subscription.id) is not None:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="already_subscribed")

    subscription.timezone = timezone
    segment = PlanSubscriptionSegment(
        subscription_id=subscription.id,
        started_at=utcnow(),
        ended_at=None,
    )
    db.add(segment)
    db.flush()

    clock = now if now is not None else datetime.now(dt_timezone.utc)
    period_start = current_period_start(template.period_kind, clock, timezone)
    existing = _applied_run_for_period(db, subscription.id, period_start)
    imported = existing is None
    run = existing
    try:
        if imported:
            run = PlanApplyRun(
                template_id=template.id,
                template_version=template.version,
                actor_user_id=user.id,
                workspace_id=workspace_id,
                project_id=project_id,
                source="subscription",
                subscription_id=subscription.id,
                segment_id=segment.id,
                period_start=period_start,
                period_kind=template.period_kind,
                status="applied",
                skipped_slots=[],
            )
            db.add(run)
            db.flush()
            materialize_run(db, run, timezone_name=timezone)
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as error:
        db.rollback()
        orig = str(getattr(error, "orig", error))
        if "uq_plan_subscription_one_open_segment" in orig:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="already_subscribed"
            ) from error
        if "uq_plan_apply_sub_applied" in orig:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT, detail="already_subscribed"
            ) from error
        raise
    db.refresh(subscription)
    if run is not None:
        db.refresh(run)
    return PlanSubscribeOut(
        id=str(subscription.id),
        imported_current_period=imported,
        apply_run=build_apply_run_out(db, run) if run is not None else None,
    )


def cancel_subscription(db: Session, user: User, subscription_id: uuid.UUID) -> None:
    subscription = db.get(PlanSubscription, subscription_id)
    if subscription is None or subscription.subscriber_user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
    ended = utcnow()
    for segment in db.scalars(
        select(PlanSubscriptionSegment).where(
            PlanSubscriptionSegment.subscription_id == subscription.id,
            PlanSubscriptionSegment.ended_at.is_(None),
        )
    ).all():
        segment.ended_at = ended
    for run in db.scalars(
        select(PlanApplyRun).where(
            PlanApplyRun.subscription_id == subscription.id,
            PlanApplyRun.status == "pending",
        )
    ).all():
        run.status = "canceled"
    db.commit()


def confirm_apply_run(db: Session, user: User, run_id: uuid.UUID) -> tuple[PlanApplyRun, bool]:
    run = _require_pending_run(db, user, run_id)
    require_project_content_access(db, run.workspace_id, run.project_id, user)
    template = db.get(PlanTemplate, run.template_id)
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
    template_updated = run.template_version != template.version
    run.template_version = template.version
    try:
        materialize_run(db, run, timezone_name=_run_timezone(db, run))
        db.commit()
    except HTTPException:
        db.rollback()
        raise
    except IntegrityError as error:
        db.rollback()
        orig = str(getattr(error, "orig", error))
        if "uq_plan_apply_sub_applied" in orig:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="run_not_pending"
            ) from error
        raise
    db.refresh(run)
    return run, template_updated


def skip_apply_run(db: Session, user: User, run_id: uuid.UUID) -> PlanApplyRun:
    run = _require_pending_run(db, user, run_id)
    run.status = "skipped"
    run.applied_at = None
    db.commit()
    db.refresh(run)
    return run
