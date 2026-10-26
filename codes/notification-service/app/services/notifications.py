from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session, aliased

from app.models._mixins import utcnow
from app.models.identity import User
from app.models.notification import Notification, NotificationDelivery, NotificationScenario
from app.schemas.notification import (
    AdminNotificationCreate,
    InboxItemOut,
    InboxOut,
    NotificationCreate,
    NotificationCreatedOut,
    ScenarioOut,
    ScenarioPatch,
)
from app.services.audience import parse_uuid, resolve_recipients
from app.services.push import push_status_for, try_push_notification
from app.services.scenarios import SCENARIO_ORDER, ensure_default_scenarios, render_template


def _clean_link(link: str | None) -> str | None:
    if link is None:
        return None
    value = link.strip()
    if not value:
        return None
    if len(value) > 500:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_link")
    if value.startswith("/") and not value.startswith("//"):
        return value
    if value.startswith(("https://", "http://")):
        return value
    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_link")


def _audience_params(payload: NotificationCreate) -> dict:
    return {
        "user_ids": list(payload.audience.user_ids),
        "project_id": payload.audience.project_id,
        "workspace_id": payload.audience.workspace_id,
        "exclude_user_ids": list(payload.audience.exclude_user_ids),
    }


def create_notification(db: Session, payload: NotificationCreate) -> NotificationCreatedOut:
    ensure_default_scenarios(db)
    scenario: NotificationScenario | None = None
    if payload.scenario_key:
        scenario = db.get(NotificationScenario, payload.scenario_key)
        if scenario is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="unknown_scenario")

    sender_id: uuid.UUID | None = None
    if payload.sender_user_id:
        sender_id = parse_uuid(payload.sender_user_id, "invalid_sender")
        if db.get(User, sender_id) is None:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_sender")

    variables = payload.variables or {}
    title = payload.title.strip() if payload.title else ""
    body = payload.body if payload.body is not None else ""
    if scenario is not None:
        if not title:
            title = render_template(scenario.title_template, variables)
        if payload.body is None:
            body = render_template(scenario.body_template, variables)
    if not title:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="missing_title")
    if payload.timing != "immediate" and payload.scheduled_at is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="missing_scheduled_at")

    status_value = "delivered"
    recipients: list[uuid.UUID] = []
    if scenario is not None and not scenario.enabled:
        status_value = "skipped"
    elif payload.timing != "immediate":
        status_value = "scheduled"
    else:
        recipients = resolve_recipients(db, payload.audience, sender_id)

    row = Notification(
        title=title,
        body=body,
        sender_user_id=sender_id,
        link=_clean_link(payload.link),
        audience_type=payload.audience.type,
        audience_params=_audience_params(payload),
        timing=payload.timing,
        scheduled_at=payload.scheduled_at,
        status=status_value,
        scenario_key=payload.scenario_key,
    )
    db.add(row)
    db.flush()
    if recipients:
        write_deliveries(db, row, scenario, recipients)
    db.commit()
    if recipients:
        try_push_notification(db, row.id)
    return NotificationCreatedOut(
        id=str(row.id),
        status=status_value,
        delivery_count=len(recipients),
        scenario_key=payload.scenario_key,
    )


def create_admin_notification(
    db: Session,
    admin: User,
    payload: AdminNotificationCreate,
) -> NotificationCreatedOut:
    audience = payload.audience
    if audience.type == "user_ids" and not any(item.strip() for item in audience.user_ids):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_audience")
    if audience.type == "project_id" and not (audience.project_id or "").strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_audience")
    if audience.type == "workspace_id" and not (audience.workspace_id or "").strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_audience")
    return create_notification(
        db,
        NotificationCreate(
            title=payload.title,
            body=payload.body,
            sender_user_id=str(admin.id),
            link=payload.link,
            audience=audience,
            timing=payload.timing,
            scheduled_at=payload.scheduled_at,
        ),
    )


def write_deliveries(
    db: Session,
    notification: Notification,
    scenario: NotificationScenario | None,
    recipients: list[uuid.UUID],
) -> None:
    push_status = push_status_for(scenario)
    for user_id in recipients:
        db.add(
            NotificationDelivery(
                notification_id=notification.id,
                user_id=user_id,
                push_status=push_status,
            )
        )


def _item_out(
    delivery: NotificationDelivery,
    notification: Notification,
    sender: User | None,
) -> InboxItemOut:
    return InboxItemOut(
        id=str(delivery.id),
        notification_id=str(notification.id),
        title=notification.title,
        body=notification.body,
        sender_user_id=str(notification.sender_user_id) if notification.sender_user_id else None,
        sender_display_name=sender.display_name if sender else None,
        link=notification.link,
        scenario_key=notification.scenario_key,
        read_at=delivery.read_at,
        created_at=delivery.created_at,
        push_status=delivery.push_status,
    )


def list_inbox(db: Session, user: User, limit: int) -> InboxOut:
    sender = aliased(User)
    rows = db.execute(
        select(NotificationDelivery, Notification, sender)
        .join(Notification, Notification.id == NotificationDelivery.notification_id)
        .outerjoin(sender, sender.id == Notification.sender_user_id)
        .where(NotificationDelivery.user_id == user.id)
        .order_by(NotificationDelivery.created_at.desc())
        .limit(limit)
    ).all()
    unread = db.scalar(
        select(func.count())
        .select_from(NotificationDelivery)
        .where(NotificationDelivery.user_id == user.id, NotificationDelivery.read_at.is_(None))
    )
    return InboxOut(
        items=[_item_out(delivery, notification, sender) for delivery, notification, sender in rows],
        unread_count=int(unread or 0),
    )


def mark_read(db: Session, user: User, delivery_id: uuid.UUID) -> InboxItemOut:
    delivery = db.get(NotificationDelivery, delivery_id)
    if delivery is None or delivery.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
    if delivery.read_at is None:
        delivery.read_at = utcnow()
        db.commit()
        db.refresh(delivery)
    notification = db.get(Notification, delivery.notification_id)
    if notification is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
    sender = db.get(User, notification.sender_user_id) if notification.sender_user_id else None
    return _item_out(delivery, notification, sender)


def mark_all_read(db: Session, user: User) -> int:
    rows = db.scalars(
        select(NotificationDelivery).where(
            NotificationDelivery.user_id == user.id,
            NotificationDelivery.read_at.is_(None),
        )
    ).all()
    now = utcnow()
    for row in rows:
        row.read_at = now
    db.commit()
    return len(rows)


def list_scenarios(db: Session) -> list[ScenarioOut]:
    ensure_default_scenarios(db)
    db.commit()
    rows = db.scalars(select(NotificationScenario)).all()
    by_key = {row.key: row for row in rows}
    ordered = [by_key[key] for key in SCENARIO_ORDER if key in by_key]
    extras = [row for row in rows if row.key not in SCENARIO_ORDER]
    return [
        ScenarioOut(
            key=row.key,
            enabled=row.enabled,
            title_template=row.title_template,
            body_template=row.body_template,
            push_enabled=row.push_enabled,
        )
        for row in [*ordered, *extras]
    ]


def patch_scenario(db: Session, key: str, payload: ScenarioPatch) -> ScenarioOut:
    ensure_default_scenarios(db)
    row = db.get(NotificationScenario, key)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
    fields = payload.model_fields_set
    if "enabled" in fields and payload.enabled is not None:
        row.enabled = payload.enabled
    if "title_template" in fields and payload.title_template is not None:
        row.title_template = payload.title_template
    if "body_template" in fields and payload.body_template is not None:
        row.body_template = payload.body_template
    if "push_enabled" in fields and payload.push_enabled is not None:
        row.push_enabled = payload.push_enabled
    row.updated_at = utcnow()
    db.commit()
    db.refresh(row)
    return ScenarioOut(
        key=row.key,
        enabled=row.enabled,
        title_template=row.title_template,
        body_template=row.body_template,
        push_enabled=row.push_enabled,
    )
