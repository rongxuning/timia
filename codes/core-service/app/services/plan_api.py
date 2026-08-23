from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models._mixins import utcnow
from app.models.plan import (
    PlanApplyRun,
    PlanComment,
    PlanFavorite,
    PlanNotification,
    PlanSlot,
    PlanSubscription,
    PlanSubscriptionSegment,
    PlanTag,
    PlanTemplate,
    PlanTemplateTag,
)
from app.models.user import User
from app.schemas.plan import (
    PlanCommentCreate,
    PlanCommentOut,
    PlanCommentUpdate,
    PlanFavoriteOut,
    PlanFavoriteUpdate,
    PlanSlotOut,
    PlanSlotPut,
    PlanTemplateCreate,
    PlanTemplateOut,
    PlanTemplateUpdate,
)
from app.services.plan_time import SLOT_LIMITS

USAGE_KINDS = frozenset({"one_shot", "subscription"})
PERIOD_KINDS = frozenset({"day", "week", "month", "year"})
VISIBILITIES = frozenset({"private", "public"})
MAX_TAGS = 8
MAX_TAG_LEN = 20


def require_plan_owner(db: Session, template_id: uuid.UUID, user: User) -> PlanTemplate:
    template = db.get(PlanTemplate, template_id)
    if not template or template.created_by_user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
    return template


def require_plan_visible(db: Session, template: PlanTemplate | None, user: User) -> PlanTemplate:
    if template is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
    if template.visibility == "public" or template.created_by_user_id == user.id:
        return template
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")


def normalize_tags(raw: list[str]) -> list[str]:
    names: list[str] = []
    seen: set[str] = set()
    for item in raw:
        name = item.strip()
        if not name:
            continue
        if len(name) > MAX_TAG_LEN:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="tag_too_long")
        if name in seen:
            continue
        seen.add(name)
        names.append(name)
    if len(names) > MAX_TAGS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="too_many_tags")
    return names


def _tag_names(db: Session, template_id: uuid.UUID) -> list[str]:
    rows = db.execute(
        select(PlanTag.name)
        .join(PlanTemplateTag, PlanTemplateTag.tag_id == PlanTag.id)
        .where(PlanTemplateTag.template_id == template_id)
        .order_by(PlanTemplateTag.created_at)
    ).all()
    return [name for (name,) in rows]


def set_template_tags(db: Session, template: PlanTemplate, names: list[str]) -> None:
    db.execute(delete(PlanTemplateTag).where(PlanTemplateTag.template_id == template.id))
    for name in names:
        tag = db.scalar(select(PlanTag).where(PlanTag.name == name))
        if tag is None:
            tag = PlanTag(name=name)
            db.add(tag)
            db.flush()
        db.add(PlanTemplateTag(template_id=template.id, tag_id=tag.id))


def build_template_out(db: Session, template: PlanTemplate) -> PlanTemplateOut:
    return PlanTemplateOut(
        id=str(template.id),
        title=template.title,
        description=template.description,
        creator_intro=template.creator_intro,
        usage_kind=template.usage_kind,
        period_kind=template.period_kind,
        visibility=template.visibility,
        tags=_tag_names(db, template.id),
        use_count=template.use_count,
        version=template.version,
        created_by_user_id=str(template.created_by_user_id),
    )


def build_slot_out(slot: PlanSlot) -> PlanSlotOut:
    return PlanSlotOut(
        id=str(slot.id),
        rel_month=slot.rel_month,
        rel_day=slot.rel_day,
        start_minute=slot.start_minute,
        end_minute=slot.end_minute,
        all_day=slot.all_day,
        title=slot.title,
        body=slot.body,
        details=slot.details,
        color=slot.color,
        priority=slot.priority,
        location=slot.location,
        sort_index=slot.sort_index,
    )


def validate_slot(period_kind: str, slot: PlanSlotPut) -> None:
    rel_month = slot.rel_month
    rel_day = slot.rel_day
    if period_kind == "day":
        ok = rel_month is None and rel_day == 0
    elif period_kind == "week":
        ok = rel_month is None and 0 <= rel_day <= 6
    elif period_kind == "month":
        ok = rel_month is None and 1 <= rel_day <= 31
    elif period_kind == "year":
        ok = rel_month is not None and 1 <= rel_month <= 12 and 1 <= rel_day <= 31
    else:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_period_kind")
    if not ok:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_slot")
    if not slot.all_day and not (0 <= slot.start_minute < slot.end_minute <= 1440):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_slot")


def notify_active_subscribers(db: Session, template: PlanTemplate) -> None:
    subscribers = (
        db.execute(
            select(PlanSubscription)
            .join(
                PlanSubscriptionSegment,
                PlanSubscriptionSegment.subscription_id == PlanSubscription.id,
            )
            .where(
                PlanSubscription.template_id == template.id,
                PlanSubscriptionSegment.ended_at.is_(None),
            )
        )
        .scalars()
        .unique()
        .all()
    )
    seen: set[uuid.UUID] = set()
    for sub in subscribers:
        if sub.subscriber_user_id in seen:
            continue
        seen.add(sub.subscriber_user_id)
        db.add(
            PlanNotification(
                user_id=sub.subscriber_user_id,
                kind="template_updated",
                template_id=template.id,
                subscription_id=sub.id,
            )
        )


def create_plan_template(db: Session, user: User, payload: PlanTemplateCreate) -> PlanTemplate:
    if payload.usage_kind not in USAGE_KINDS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_usage_kind")
    if payload.period_kind not in PERIOD_KINDS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_period_kind")
    if payload.visibility not in VISIBILITIES:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_visibility")
    names = normalize_tags(payload.tags)
    template = PlanTemplate(
        created_by_user_id=user.id,
        title=payload.title.strip(),
        description=payload.description,
        creator_intro=payload.creator_intro,
        usage_kind=payload.usage_kind,
        period_kind=payload.period_kind,
        visibility=payload.visibility,
        use_count=0,
        version=1,
    )
    db.add(template)
    db.flush()
    set_template_tags(db, template, names)
    db.commit()
    db.refresh(template)
    return template


def update_plan_template(
    db: Session, user: User, template_id: uuid.UUID, payload: PlanTemplateUpdate
) -> PlanTemplate:
    template = require_plan_owner(db, template_id, user)
    fields = payload.model_fields_set
    bump = False
    if "title" in fields and payload.title is not None:
        title = payload.title.strip()
        if title and title != template.title:
            template.title = title
            bump = True
    if "description" in fields and payload.description != template.description:
        template.description = payload.description
        bump = True
    if "creator_intro" in fields and payload.creator_intro != template.creator_intro:
        template.creator_intro = payload.creator_intro
        bump = True
    if "visibility" in fields and payload.visibility is not None:
        if payload.visibility not in VISIBILITIES:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_visibility"
            )
        template.visibility = payload.visibility
    if "tags" in fields and payload.tags is not None:
        set_template_tags(db, template, normalize_tags(payload.tags))
    if bump:
        template.version += 1
        notify_active_subscribers(db, template)
    db.commit()
    db.refresh(template)
    return template


def replace_slots(
    db: Session, user: User, template_id: uuid.UUID, slots: list[PlanSlotPut]
) -> list[PlanSlot]:
    template = require_plan_owner(db, template_id, user)
    limit = SLOT_LIMITS[template.period_kind]
    if len(slots) > limit:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="too_many_slots")
    for slot in slots:
        validate_slot(template.period_kind, slot)
    db.execute(delete(PlanSlot).where(PlanSlot.template_id == template.id))
    rows: list[PlanSlot] = []
    for slot in slots:
        loc = (slot.location or "").strip() or None
        row = PlanSlot(
            template_id=template.id,
            rel_month=slot.rel_month,
            rel_day=slot.rel_day,
            start_minute=slot.start_minute,
            end_minute=slot.end_minute,
            all_day=slot.all_day,
            title=slot.title,
            body=slot.body,
            details=slot.details,
            color=slot.color,
            priority=slot.priority,
            location=loc,
            sort_index=slot.sort_index,
        )
        db.add(row)
        rows.append(row)
    template.version += 1
    notify_active_subscribers(db, template)
    db.commit()
    for row in rows:
        db.refresh(row)
    return rows


def close_template_subscriptions(db: Session, template: PlanTemplate) -> None:
    now = utcnow()
    open_segments = db.scalars(
        select(PlanSubscriptionSegment)
        .join(
            PlanSubscription,
            PlanSubscription.id == PlanSubscriptionSegment.subscription_id,
        )
        .where(
            PlanSubscription.template_id == template.id,
            PlanSubscriptionSegment.ended_at.is_(None),
        )
    ).all()
    for segment in open_segments:
        segment.ended_at = now
    pending_runs = db.scalars(
        select(PlanApplyRun).where(
            PlanApplyRun.template_id == template.id,
            PlanApplyRun.status == "pending",
        )
    ).all()
    for run in pending_runs:
        run.status = "canceled"


def delete_plan_template(db: Session, user: User, template_id: uuid.UUID) -> None:
    template = require_plan_owner(db, template_id, user)
    close_template_subscriptions(db, template)
    db.flush()
    db.delete(template)
    db.commit()


def mark_notification_read(db: Session, user: User, notification_id: uuid.UUID) -> None:
    note = db.get(PlanNotification, notification_id)
    if note is None or note.user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
    if note.read_at is None:
        note.read_at = utcnow()
    db.commit()


def build_comment_out(db: Session, comment: PlanComment) -> PlanCommentOut:
    name = db.scalar(select(User.display_name).where(User.id == comment.author_user_id)) or ""
    return PlanCommentOut(
        id=str(comment.id),
        author_user_id=str(comment.author_user_id),
        author_display_name=name,
        body=comment.body,
        created_at=comment.created_at,
        parent_comment_id=str(comment.parent_comment_id) if comment.parent_comment_id else None,
    )


def _visible_template(db: Session, template_id: uuid.UUID, user: User) -> PlanTemplate:
    return require_plan_visible(db, db.get(PlanTemplate, template_id), user)


def _require_comment_author(
    db: Session, template_id: uuid.UUID, comment_id: uuid.UUID, user: User
) -> PlanComment:
    comment = db.get(PlanComment, comment_id)
    if (
        comment is None
        or comment.template_id != template_id
        or comment.deleted_at is not None
        or comment.author_user_id != user.id
    ):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="not_found")
    return comment


def list_plan_comments(db: Session, user: User, template_id: uuid.UUID) -> list[PlanComment]:
    _visible_template(db, template_id, user)
    return list(
        db.scalars(
            select(PlanComment)
            .where(
                PlanComment.template_id == template_id,
                PlanComment.deleted_at.is_(None),
            )
            .order_by(PlanComment.created_at.asc())
        ).all()
    )


def create_plan_comment(
    db: Session, user: User, template_id: uuid.UUID, payload: PlanCommentCreate
) -> PlanComment:
    template = _visible_template(db, template_id, user)
    parent_id = payload.parent_comment_id
    parent: PlanComment | None = None
    if parent_id is not None:
        parent = db.get(PlanComment, parent_id)
        if parent is None or parent.template_id != template.id or parent.deleted_at is not None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="parent_comment_not_found"
            )
        if parent.parent_comment_id is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="cannot_reply_to_reply"
            )
    body = (payload.body or "").strip()
    if not body:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="empty_body")
    comment = PlanComment(
        template_id=template.id,
        author_user_id=user.id,
        body=body,
        parent_comment_id=parent_id,
    )
    db.add(comment)
    db.flush()
    if parent is not None and parent.author_user_id != user.id:
        db.add(
            PlanNotification(
                user_id=parent.author_user_id,
                kind="comment_reply",
                template_id=template.id,
            )
        )
    db.commit()
    db.refresh(comment)
    return comment


def update_plan_comment(
    db: Session,
    user: User,
    template_id: uuid.UUID,
    comment_id: uuid.UUID,
    payload: PlanCommentUpdate,
) -> PlanComment:
    _visible_template(db, template_id, user)
    comment = _require_comment_author(db, template_id, comment_id, user)
    body = (payload.body or "").strip()
    if not body:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="empty_body")
    comment.body = body
    db.commit()
    db.refresh(comment)
    return comment


def delete_plan_comment(
    db: Session, user: User, template_id: uuid.UUID, comment_id: uuid.UUID
) -> None:
    _visible_template(db, template_id, user)
    comment = _require_comment_author(db, template_id, comment_id, user)
    comment.deleted_at = utcnow()
    db.commit()


def update_plan_favorite(
    db: Session, user: User, template_id: uuid.UUID, payload: PlanFavoriteUpdate
) -> PlanFavoriteOut:
    template = _visible_template(db, template_id, user)
    favorite = db.scalar(
        select(PlanFavorite).where(
            PlanFavorite.template_id == template.id,
            PlanFavorite.user_id == user.id,
        )
    )
    if payload.is_favorite and not favorite:
        db.add(PlanFavorite(template_id=template.id, user_id=user.id))
    elif not payload.is_favorite and favorite:
        db.delete(favorite)
    db.commit()
    return PlanFavoriteOut(template_id=str(template.id), is_favorite=payload.is_favorite)
