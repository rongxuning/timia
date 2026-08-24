from __future__ import annotations

import logging
from datetime import date, datetime

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.db.session import SessionLocal
from app.models._mixins import utcnow
from app.models.plan import (
    PlanApplyRun,
    PlanNotification,
    PlanSubscription,
    PlanSubscriptionSegment,
    PlanTemplate,
)
from app.services.plan_time import (
    in_reminder_window,
    pending_should_expire,
    upcoming_period_start,
)
from app.services.plan_api import SUBSCRIPTION_MODE

logger = logging.getLogger(__name__)

_OCCUPIED_STATUSES = frozenset({"applied", "pending", "skipped", "expired"})


def _expire_older_pending_runs(runs: list[PlanApplyRun], period_start: date) -> int:
    expired = 0
    for run in runs:
        if run.status == "pending" and run.period_start < period_start:
            run.status = "expired"
            expired += 1
    return expired


def run_plan_reminders(db: Session, now: datetime | None = None) -> dict:
    if now is None:
        now = utcnow()

    pending_created = 0
    expired = 0
    segments = db.scalars(
        select(PlanSubscriptionSegment).where(PlanSubscriptionSegment.ended_at.is_(None))
    ).all()
    for segment in segments:
        try:
            with db.begin_nested():
                created, superseded = _create_pending_for_segment(db, segment, now)
                pending_created += created
                expired += superseded
        except IntegrityError:
            pass
        except Exception:
            logger.exception(
                "plan reminder failed for subscription=%s segment=%s",
                segment.subscription_id,
                segment.id,
            )
        try:
            with db.begin_nested():
                expired += _expire_pending_for_segment(db, segment, now)
        except Exception:
            logger.exception(
                "plan reminder expire failed for subscription=%s segment=%s",
                segment.subscription_id,
                segment.id,
            )
    return {"pending_created": pending_created, "expired": expired}


def _create_pending_for_segment(
    db: Session, segment: PlanSubscriptionSegment, now: datetime
) -> tuple[int, int]:
    sub = db.get(PlanSubscription, segment.subscription_id)
    if sub is None:
        return 0, 0
    template = db.get(PlanTemplate, sub.template_id)
    if template is None:
        return 0, 0
    runs = list(
        db.scalars(select(PlanApplyRun).where(PlanApplyRun.subscription_id == sub.id)).all()
    )
    existing = {run.period_start for run in runs if run.status in _OCCUPIED_STATUSES}
    period_start = upcoming_period_start(template.period_kind, now, sub.timezone, existing)
    if not in_reminder_window(period_start, now, sub.timezone):
        return 0, 0
    superseded = _expire_older_pending_runs(runs, period_start)
    try:
        with db.begin_nested():
            run = PlanApplyRun(
                template_id=template.id,
                template_version=template.version,
                actor_user_id=sub.subscriber_user_id,
                workspace_id=sub.workspace_id,
                project_id=sub.project_id,
                source=SUBSCRIPTION_MODE,
                subscription_id=sub.id,
                segment_id=segment.id,
                period_start=period_start,
                period_kind=template.period_kind,
                status="pending",
                skipped_slots=[],
            )
            db.add(run)
            db.flush()
            db.add(
                PlanNotification(
                    user_id=sub.subscriber_user_id,
                    kind="upcoming_period",
                    template_id=template.id,
                    subscription_id=sub.id,
                    apply_run_id=run.id,
                )
            )
            db.flush()
        return 1, superseded
    except IntegrityError:
        return 0, superseded


def _expire_pending_for_segment(
    db: Session, segment: PlanSubscriptionSegment, now: datetime
) -> int:
    sub = db.get(PlanSubscription, segment.subscription_id)
    if sub is None:
        return 0
    template = db.get(PlanTemplate, sub.template_id)
    if template is None:
        return 0
    expired = 0
    for run in db.scalars(
        select(PlanApplyRun).where(
            PlanApplyRun.subscription_id == sub.id,
            PlanApplyRun.status == "pending",
        )
    ).all():
        try:
            if pending_should_expire(template.period_kind, run.period_start, now, sub.timezone):
                run.status = "expired"
                expired += 1
        except Exception:
            logger.exception(
                "plan reminder expire failed for subscription=%s segment=%s run=%s",
                sub.id,
                segment.id,
                run.id,
            )
    return expired


def main() -> None:
    db = SessionLocal()
    try:
        run_plan_reminders(db)
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    main()
