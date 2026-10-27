"""Push status and APNs delivery.

Missing APNs keys leave ``pending`` rows alone and report ``push_not_configured``.
A send failure never raises into notification creation or the scheduler.
"""

from __future__ import annotations

import logging
import re
import uuid

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models._mixins import utcnow
from app.models.identity import User
from app.models.notification import (
    DevicePushToken,
    Notification,
    NotificationDelivery,
    NotificationScenario,
)
from app.services.apns import ApnsMessage, apns_environment, apns_is_configured, send_alerts

logger = logging.getLogger(__name__)

_TOKEN_RE = re.compile(r"^[0-9a-f]{64,200}$")


def push_status_for(scenario: NotificationScenario | None) -> str:
    """Delivery push state for one recipient.

    Admin broadcasts have no scenario and still go to APNs. A scenario sends
    when its own ``push_enabled`` flag is on, and stays in the inbox otherwise.
    """
    if scenario is None or scenario.push_enabled:
        return "pending"
    return "skipped"


def pending_push_count(db: Session) -> int:
    value = db.scalar(
        select(func.count())
        .select_from(NotificationDelivery)
        .where(NotificationDelivery.push_status == "pending")
    )
    return int(value or 0)


def normalize_device_token(value: str) -> str:
    cleaned = value.strip().replace(" ", "").replace("<", "").replace(">", "").lower()
    if len(cleaned) % 2 != 0 or not _TOKEN_RE.fullmatch(cleaned):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_device_token")
    return cleaned


def register_device_token(
    db: Session,
    user: User,
    raw_token: str,
    environment: str | None,
) -> DevicePushToken:
    token = normalize_device_token(raw_token)
    env = environment or apns_environment()
    if env not in ("sandbox", "production"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_device_token")
    row = db.scalar(select(DevicePushToken).where(DevicePushToken.token == token))
    if row is None:
        row = DevicePushToken(user_id=user.id, token=token, platform="apns", environment=env)
        db.add(row)
    else:
        row.user_id = user.id
        row.platform = "apns"
        row.environment = env
        row.invalidated_at = None
        row.updated_at = utcnow()
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        row = db.scalar(select(DevicePushToken).where(DevicePushToken.token == token))
        if row is None:
            raise
        row.user_id = user.id
        row.platform = "apns"
        row.environment = env
        row.invalidated_at = None
        row.updated_at = utcnow()
        db.commit()
    db.refresh(row)
    return row


def unregister_device_token(db: Session, user: User, raw_token: str) -> None:
    token = normalize_device_token(raw_token)
    row = db.scalar(select(DevicePushToken).where(DevicePushToken.token == token))
    if row is None or row.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
    db.delete(row)
    db.commit()


def try_push_notification(db: Session, notification_id: uuid.UUID) -> None:
    """Best-effort send for one notification. Swallows provider errors."""
    try:
        result = push_pending_deliveries(db, notification_id=notification_id)
        if result.get("configured"):
            db.commit()
    except Exception:
        logger.exception("apns push failed for %s", notification_id)
        db.rollback()


def flush_pending_pushes(db: Session) -> dict:
    """Send every pending delivery when APNs is configured. Used by the scheduler."""
    try:
        result = push_pending_deliveries(db)
        if result.get("configured"):
            db.commit()
        return result
    except Exception:
        logger.exception("apns pending flush failed")
        db.rollback()
        return {
            "ok": False,
            "configured": apns_is_configured(),
            "detail": "push_failed",
            "pending": pending_push_count(db),
            "sent": 0,
            "failed": 0,
            "skipped": 0,
        }


def push_pending_deliveries(db: Session, *, notification_id: uuid.UUID | None = None) -> dict:
    pending = pending_push_count(db) if notification_id is None else _pending_for(db, notification_id)
    if not apns_is_configured():
        return {
            "ok": False,
            "configured": False,
            "detail": "push_not_configured",
            "pending": pending,
            "sent": 0,
            "failed": 0,
            "skipped": 0,
        }

    stmt = select(NotificationDelivery).where(NotificationDelivery.push_status == "pending")
    if notification_id is not None:
        stmt = stmt.where(NotificationDelivery.notification_id == notification_id)
    deliveries = list(db.scalars(stmt).all())
    if not deliveries:
        return {
            "ok": True,
            "configured": True,
            "detail": "dispatched",
            "pending": 0,
            "sent": 0,
            "failed": 0,
            "skipped": 0,
        }

    notifications = {
        row.id: row
        for row in db.scalars(
            select(Notification).where(Notification.id.in_({item.notification_id for item in deliveries}))
        ).all()
    }
    env = apns_environment()
    user_ids = {item.user_id for item in deliveries}
    token_rows = list(
        db.scalars(
            select(DevicePushToken).where(
                DevicePushToken.user_id.in_(user_ids),
                DevicePushToken.platform == "apns",
                DevicePushToken.environment == env,
                DevicePushToken.invalidated_at.is_(None),
            )
        ).all()
    )
    by_user: dict[uuid.UUID, list[DevicePushToken]] = {}
    for token_row in token_rows:
        by_user.setdefault(token_row.user_id, []).append(token_row)
    tokens_by_hex = {row.token: row for row in token_rows}

    messages: list[ApnsMessage] = []
    message_delivery: list[uuid.UUID] = []
    sent = 0
    failed = 0
    skipped = 0
    for delivery in deliveries:
        owned = by_user.get(delivery.user_id, [])
        if not owned:
            delivery.push_status = "skipped"
            delivery.updated_at = utcnow()
            skipped += 1
            continue
        note = notifications.get(delivery.notification_id)
        title = note.title if note else ""
        body = note.body if note else ""
        link = note.link if note else None
        for token_row in owned:
            messages.append(ApnsMessage(token=token_row.token, title=title, body=body, link=link))
            message_delivery.append(delivery.id)

    outcomes: dict[uuid.UUID, list[str]] = {item.id: [] for item in deliveries}
    if messages:
        try:
            results = send_alerts(messages)
        except Exception:
            logger.exception("apns provider rejected the batch")
            return {
                "ok": False,
                "configured": True,
                "detail": "push_key_invalid",
                "pending": len(deliveries) - skipped,
                "sent": 0,
                "failed": 0,
                "skipped": skipped,
            }
        for result, delivery_id in zip(results, message_delivery, strict=True):
            outcomes[delivery_id].append(result.outcome)
            if result.outcome == "invalid":
                token_row = tokens_by_hex.get(result.token)
                if token_row is not None and token_row.invalidated_at is None:
                    token_row.invalidated_at = utcnow()
                    token_row.updated_at = utcnow()

    for delivery in deliveries:
        if delivery.push_status == "skipped":
            continue
        result_outcomes = outcomes.get(delivery.id, [])
        if "sent" in result_outcomes:
            delivery.push_status = "sent"
            sent += 1
        elif "transport" in result_outcomes:
            delivery.push_status = "pending"
        elif result_outcomes:
            delivery.push_status = "failed"
            failed += 1
        else:
            delivery.push_status = "skipped"
            skipped += 1
        delivery.updated_at = utcnow()

    still_pending = sum(1 for item in deliveries if item.push_status == "pending")
    return {
        "ok": True,
        "configured": True,
        "detail": "dispatched",
        "pending": still_pending,
        "sent": sent,
        "failed": failed,
        "skipped": skipped,
    }


def _pending_for(db: Session, notification_id: uuid.UUID) -> int:
    value = db.scalar(
        select(func.count())
        .select_from(NotificationDelivery)
        .where(
            NotificationDelivery.notification_id == notification_id,
            NotificationDelivery.push_status == "pending",
        )
    )
    return int(value or 0)
