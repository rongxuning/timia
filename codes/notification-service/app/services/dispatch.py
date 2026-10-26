"""Expand delay and scheduled notifications once they are due.

Callers store the fire time in ``scheduled_at`` (for ``delay``, that is now plus
the delay). A row stays ``scheduled`` until this scan. Expansion matches immediate
delivery: drop the sender, dedupe recipients, and honor the scenario switch at
scan time.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime

from fastapi import HTTPException
from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models._mixins import utcnow
from app.models.notification import Notification, NotificationDelivery, NotificationScenario
from app.schemas.notification import AudienceIn
from app.services.audience import resolve_recipients
from app.services.notifications import write_deliveries

logger = logging.getLogger(__name__)


def dispatch_due_notifications(
    db: Session,
    now: datetime | None = None,
    *,
    limit: int = 100,
) -> dict[str, int]:
    moment = _as_utc(now or utcnow())
    ids = list(db.scalars(_due_ids(db, moment, limit)).all())
    delivered = 0
    skipped = 0
    delivery_count = 0
    for notification_id in ids:
        outcome, count = _dispatch_one(db, notification_id, moment)
        if outcome == "delivered":
            delivered += 1
            delivery_count += count
        elif outcome == "skipped":
            skipped += 1
    return {
        "delivered": delivered,
        "skipped": skipped,
        "delivery_count": delivery_count,
    }


def _due_ids(db: Session, moment: datetime, limit: int):
    stmt = (
        select(Notification.id)
        .where(
            Notification.status == "scheduled",
            Notification.timing.in_(("delay", "scheduled")),
            Notification.scheduled_at.is_not(None),
            Notification.scheduled_at <= moment,
        )
        .order_by(Notification.scheduled_at.asc(), Notification.id.asc())
        .limit(limit)
    )
    bind = db.get_bind()
    if bind is not None and bind.dialect.name == "postgresql":
        stmt = stmt.with_for_update(skip_locked=True)
    return stmt


def _dispatch_one(db: Session, notification_id, moment: datetime) -> tuple[str, int]:
    row = db.get(Notification, notification_id)
    if row is None or row.status != "scheduled":
        return "unchanged", 0
    if row.scheduled_at is None or _as_utc(row.scheduled_at) > moment:
        return "unchanged", 0
    try:
        outcome, count = _expand_due(db, row)
        db.commit()
        return outcome, count
    except IntegrityError:
        logger.info("notification %s already expanded", notification_id)
        db.rollback()
        return _reconcile_duplicate(db, notification_id)


def _expand_due(db: Session, row: Notification) -> tuple[str, int]:
    scenario: NotificationScenario | None = None
    if row.scenario_key:
        scenario = db.get(NotificationScenario, row.scenario_key)
        if scenario is None or not scenario.enabled:
            row.status = "skipped"
            return "skipped", 0
    try:
        audience = _audience_from_row(row)
        recipients = resolve_recipients(db, audience, row.sender_user_id)
    except ValidationError:
        logger.warning("notification %s has an invalid audience", row.id)
        row.status = "skipped"
        return "skipped", 0
    except HTTPException as exc:
        logger.warning("notification %s audience rejected: %s", row.id, exc.detail)
        row.status = "skipped"
        return "skipped", 0
    write_deliveries(db, row, scenario, recipients)
    row.status = "delivered"
    return "delivered", len(recipients)


def _reconcile_duplicate(db: Session, notification_id) -> tuple[str, int]:
    row = db.get(Notification, notification_id)
    if row is None or row.status != "scheduled":
        return "unchanged", 0
    count = db.scalar(
        select(func.count())
        .select_from(NotificationDelivery)
        .where(NotificationDelivery.notification_id == notification_id)
    )
    if not count:
        return "unchanged", 0
    row.status = "delivered"
    db.commit()
    return "delivered", int(count)


def _audience_from_row(row: Notification) -> AudienceIn:
    params = row.audience_params or {}
    return AudienceIn(
        type=row.audience_type,
        user_ids=list(params.get("user_ids") or []),
        project_id=params.get("project_id"),
        workspace_id=params.get("workspace_id"),
        exclude_user_ids=list(params.get("exclude_user_ids") or []),
    )


def _as_utc(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=UTC)
    return value.astimezone(UTC)
