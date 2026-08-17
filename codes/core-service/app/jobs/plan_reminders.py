from __future__ import annotations

from datetime import datetime

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


def run_plan_reminders(db: Session, now: datetime | None = None) -> dict:
    if now is None:
        now = utcnow()

    pending_created = 0
    expired = 0
    segments = db.scalars(
        select(PlanSubscriptionSegment).where(PlanSubscriptionSegment.ended_at.is_(None))
    ).all()
    for segment in segments:
        sub = db.get(PlanSubscription, segment.subscription_id)
        if sub is None:
            continue
        template = db.get(PlanTemplate, sub.template_id)
        if template is None:
            continue
        runs = list(
            db.scalars(select(PlanApplyRun).where(PlanApplyRun.subscription_id == sub.id)).all()
        )
        existing = {run.period_start for run in runs}
        period_start = upcoming_period_start(template.period_kind, now, sub.timezone, existing)
        if in_reminder_window(period_start, now, sub.timezone):
            try:
                with db.begin_nested():
                    run = PlanApplyRun(
                        template_id=template.id,
                        template_version=template.version,
                        actor_user_id=sub.subscriber_user_id,
                        workspace_id=sub.workspace_id,
                        project_id=sub.project_id,
                        source="subscription",
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
                pending_created += 1
            except IntegrityError:
                pass
        for run in db.scalars(
            select(PlanApplyRun).where(
                PlanApplyRun.subscription_id == sub.id,
                PlanApplyRun.status == "pending",
            )
        ).all():
            if pending_should_expire(template.period_kind, run.period_start, now, sub.timezone):
                run.status = "expired"
                expired += 1
    return {"pending_created": pending_created, "expired": expired}


def main() -> None:
    db = SessionLocal()
    try:
        run_plan_reminders(db)
        db.commit()
    finally:
        db.close()


if __name__ == "__main__":
    main()
