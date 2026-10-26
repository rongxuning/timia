"""Push stays a status flag. Device tokens and APNs delivery are not implemented."""

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.notification import NotificationDelivery, NotificationScenario


def push_status_for(scenario: NotificationScenario | None) -> str:
    if scenario is not None and scenario.push_enabled:
        return "pending"
    return "skipped"


def pending_push_count(db: Session) -> int:
    value = db.scalar(
        select(func.count())
        .select_from(NotificationDelivery)
        .where(NotificationDelivery.push_status == "pending")
    )
    return int(value or 0)
