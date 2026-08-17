"""Plan list/detail/imported/subscribed/notification view builders."""

from __future__ import annotations

import uuid
from collections import defaultdict

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.item import Item
from app.models.plan import (
    PlanApplyRun,
    PlanNotification,
    PlanSlot,
    PlanSubscription,
    PlanSubscriptionSegment,
    PlanTag,
    PlanTemplate,
    PlanTemplateTag,
)
from app.models.project import Project
from app.models.user import User
from app.models.workspace import Workspace
from app.schemas.views.plans import (
    PlanCardOut,
    PlanCreatorOut,
    PlanDetailOut,
    PlanImportedListOut,
    PlanImportedRowOut,
    PlanImportedRunOut,
    PlanListOut,
    PlanMySubscriptionOut,
    PlanNotificationListOut,
    PlanNotificationOut,
    PlanPendingRunOut,
    PlanRunItemOut,
    PlanSubscribedListOut,
    PlanSubscribedRowOut,
    PlanSubscribedSegmentOut,
)
from app.services.plan_api import build_slot_out

LIST_TABS = frozenset({"discover", "created", "imported", "subscribed"})
MAX_LIMIT = 50
DEFAULT_LIMIT = 20


def _page(limit: int, offset: int) -> tuple[int, int]:
    limit = min(max(limit, 1), MAX_LIMIT)
    offset = max(offset, 0)
    return limit, offset


def _creator_out(user: User | None, user_id: uuid.UUID) -> PlanCreatorOut:
    return PlanCreatorOut(
        id=str(user_id),
        display_name=user.display_name if user else "",
    )


def _card(template: PlanTemplate, creator: User | None, tags: list[str]) -> PlanCardOut:
    return PlanCardOut(
        id=str(template.id),
        title=template.title,
        usage_kind=template.usage_kind,
        period_kind=template.period_kind,
        visibility=template.visibility,
        creator=_creator_out(creator, template.created_by_user_id),
        tags=tags,
        use_count=template.use_count,
    )


def _tags_by_template(
    db: Session, template_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[str]]:
    result: dict[uuid.UUID, list[str]] = defaultdict(list)
    if not template_ids:
        return result
    rows = db.execute(
        select(PlanTemplateTag.template_id, PlanTag.name)
        .join(PlanTag, PlanTag.id == PlanTemplateTag.tag_id)
        .where(PlanTemplateTag.template_id.in_(template_ids))
        .order_by(PlanTemplateTag.created_at)
    ).all()
    for template_id, name in rows:
        result[template_id].append(name)
    return result


def _users_by_id(db: Session, user_ids: list[uuid.UUID]) -> dict[uuid.UUID, User]:
    if not user_ids:
        return {}
    rows = db.scalars(select(User).where(User.id.in_(user_ids))).all()
    return {row.id: row for row in rows}


def _pending_out(run: PlanApplyRun) -> PlanPendingRunOut:
    return PlanPendingRunOut(
        id=str(run.id),
        period_start=run.period_start,
        status=run.status,
        template_version=run.template_version,
    )


def _items_by_run(
    db: Session, run_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[PlanRunItemOut]]:
    result: dict[uuid.UUID, list[PlanRunItemOut]] = {run_id: [] for run_id in run_ids}
    if not run_ids:
        return result
    items = db.scalars(
        select(Item)
        .where(Item.source_plan_apply_run_id.in_(run_ids))
        .order_by(Item.start_at, Item.created_at)
    ).all()
    for item in items:
        if item.source_plan_apply_run_id is None:
            continue
        result.setdefault(item.source_plan_apply_run_id, []).append(
            PlanRunItemOut(id=str(item.id), title=item.title, deleted=False)
        )
    return result


def _imported_run_out(
    run: PlanApplyRun, items: list[PlanRunItemOut]
) -> PlanImportedRunOut:
    return PlanImportedRunOut(
        period_start=run.period_start,
        applied_at=run.applied_at,
        items=items,
    )


def _applied_stmt(user_id: uuid.UUID):
    """Templates the actor has at least one applied run for (one_shot or subscription)."""
    return select(PlanApplyRun.template_id).where(
        PlanApplyRun.actor_user_id == user_id,
        PlanApplyRun.status == "applied",
    )


def _active_subscription_template_stmt(user_id: uuid.UUID):
    return (
        select(PlanSubscription.template_id)
        .join(
            PlanSubscriptionSegment,
            PlanSubscriptionSegment.subscription_id == PlanSubscription.id,
        )
        .where(
            PlanSubscription.subscriber_user_id == user_id,
            PlanSubscriptionSegment.ended_at.is_(None),
        )
    )


def list_plan_cards(
    db: Session,
    user: User,
    *,
    tab: str = "discover",
    q: str | None = None,
    visibility: str | None = None,
    creator_q: str | None = None,
    tags: list[str] | None = None,
    period_kind: str | None = None,
    usage_kind: str | None = None,
    limit: int = DEFAULT_LIMIT,
    offset: int = 0,
) -> PlanListOut:
    if tab not in LIST_TABS:
        raise ValueError("invalid_tab")
    limit, offset = _page(limit, offset)
    stmt = select(PlanTemplate).join(User, User.id == PlanTemplate.created_by_user_id)
    if tab == "discover":
        stmt = stmt.where(PlanTemplate.visibility == "public")
    elif tab == "created":
        stmt = stmt.where(PlanTemplate.created_by_user_id == user.id)
        if visibility:
            stmt = stmt.where(PlanTemplate.visibility == visibility)
    elif tab == "imported":
        stmt = stmt.where(PlanTemplate.id.in_(_applied_stmt(user.id).distinct()))
    elif tab == "subscribed":
        stmt = stmt.where(
            PlanTemplate.id.in_(_active_subscription_template_stmt(user.id).distinct())
        )
    if q:
        stmt = stmt.where(PlanTemplate.title.ilike(f"%{q.strip()}%"))
    if creator_q:
        stmt = stmt.where(User.display_name.ilike(f"%{creator_q.strip()}%"))
    if period_kind:
        stmt = stmt.where(PlanTemplate.period_kind == period_kind)
    if usage_kind:
        stmt = stmt.where(PlanTemplate.usage_kind == usage_kind)
    for tag_name in tags or []:
        name = tag_name.strip()
        if not name:
            continue
        stmt = stmt.where(
            PlanTemplate.id.in_(
                select(PlanTemplateTag.template_id)
                .join(PlanTag, PlanTag.id == PlanTemplateTag.tag_id)
                .where(PlanTag.name == name)
            )
        )
    templates = list(
        db.scalars(
            stmt.order_by(PlanTemplate.use_count.desc(), PlanTemplate.created_at.desc())
            .offset(offset)
            .limit(limit)
        ).all()
    )
    creators = _users_by_id(db, [t.created_by_user_id for t in templates])
    tags_map = _tags_by_template(db, [t.id for t in templates])
    return PlanListOut(
        items=[
            _card(template, creators.get(template.created_by_user_id), tags_map[template.id])
            for template in templates
        ]
    )


def get_plan_detail(db: Session, user: User, plan_id: uuid.UUID) -> PlanDetailOut:
    template = db.get(PlanTemplate, plan_id)
    if template is None:
        raise ValueError("not_found")
    if template.visibility != "public" and template.created_by_user_id != user.id:
        raise ValueError("not_found")
    creator = db.get(User, template.created_by_user_id)
    tags = _tags_by_template(db, [template.id]).get(template.id, [])
    slots = [
        build_slot_out(slot)
        for slot in db.scalars(
            select(PlanSlot)
            .where(PlanSlot.template_id == template.id)
            .order_by(PlanSlot.sort_index, PlanSlot.created_at)
        ).all()
    ]
    my_import_count = int(
        db.scalar(
            select(func.count()).select_from(PlanApplyRun).where(
                PlanApplyRun.template_id == template.id,
                PlanApplyRun.actor_user_id == user.id,
                PlanApplyRun.status == "applied",
            )
        )
        or 0
    )
    subscription = db.scalar(
        select(PlanSubscription)
        .join(
            PlanSubscriptionSegment,
            PlanSubscriptionSegment.subscription_id == PlanSubscription.id,
        )
        .where(
            PlanSubscription.template_id == template.id,
            PlanSubscription.subscriber_user_id == user.id,
            PlanSubscriptionSegment.ended_at.is_(None),
        )
        .order_by(PlanSubscription.created_at.desc())
    )
    my_subscription: PlanMySubscriptionOut | None = None
    if subscription is not None:
        workspace = db.get(Workspace, subscription.workspace_id)
        project = db.get(Project, subscription.project_id)
        my_subscription = PlanMySubscriptionOut(
            id=str(subscription.id),
            workspace_id=str(subscription.workspace_id),
            workspace_name=workspace.name if workspace else "",
            project_id=str(subscription.project_id),
            project_name=project.name if project else "",
            timezone=subscription.timezone,
        )
    pending = db.scalar(
        select(PlanApplyRun)
        .where(
            PlanApplyRun.template_id == template.id,
            PlanApplyRun.actor_user_id == user.id,
            PlanApplyRun.status == "pending",
        )
        .order_by(PlanApplyRun.period_start.desc())
    )
    card = _card(template, creator, tags)
    return PlanDetailOut(
        **card.model_dump(),
        description=template.description,
        creator_intro=template.creator_intro,
        slots=slots,
        my_import_count=my_import_count,
        my_subscription=my_subscription,
        pending_run=_pending_out(pending) if pending else None,
    )


def list_imported_plans(
    db: Session,
    user: User,
    *,
    limit: int = DEFAULT_LIMIT,
    offset: int = 0,
) -> PlanImportedListOut:
    limit, offset = _page(limit, offset)
    runs = list(
        db.scalars(
            select(PlanApplyRun)
            .where(
                PlanApplyRun.actor_user_id == user.id,
                PlanApplyRun.status == "applied",
            )
            .order_by(PlanApplyRun.applied_at.desc(), PlanApplyRun.created_at.desc())
        ).all()
    )
    template_ids: list[uuid.UUID] = []
    seen: set[uuid.UUID] = set()
    for run in runs:
        if run.template_id in seen:
            continue
        seen.add(run.template_id)
        template_ids.append(run.template_id)
    page_ids = template_ids[offset : offset + limit]
    if not page_ids:
        return PlanImportedListOut(items=[])
    templates = {
        row.id: row
        for row in db.scalars(select(PlanTemplate).where(PlanTemplate.id.in_(page_ids))).all()
    }
    creators = _users_by_id(
        db, [templates[tid].created_by_user_id for tid in page_ids if tid in templates]
    )
    tags_map = _tags_by_template(db, page_ids)
    page_runs = [run for run in runs if run.template_id in set(page_ids)]
    items_map = _items_by_run(db, [run.id for run in page_runs])
    runs_by_template: dict[uuid.UUID, list[PlanApplyRun]] = defaultdict(list)
    for run in page_runs:
        runs_by_template[run.template_id].append(run)
    items: list[PlanImportedRowOut] = []
    for template_id in page_ids:
        template = templates.get(template_id)
        if template is None:
            continue
        template_runs = runs_by_template[template_id]
        card = _card(template, creators.get(template.created_by_user_id), tags_map[template.id])
        items.append(
            PlanImportedRowOut(
                **card.model_dump(),
                my_import_count=len(template_runs),
                runs=[
                    _imported_run_out(run, items_map.get(run.id, [])) for run in template_runs
                ],
            )
        )
    return PlanImportedListOut(items=items)


def list_subscribed_plans(
    db: Session,
    user: User,
    *,
    limit: int = DEFAULT_LIMIT,
    offset: int = 0,
) -> PlanSubscribedListOut:
    limit, offset = _page(limit, offset)
    subscriptions = list(
        db.scalars(
            select(PlanSubscription)
            .join(
                PlanSubscriptionSegment,
                PlanSubscriptionSegment.subscription_id == PlanSubscription.id,
            )
            .where(
                PlanSubscription.subscriber_user_id == user.id,
                PlanSubscriptionSegment.ended_at.is_(None),
            )
            .order_by(PlanSubscription.created_at.desc())
            .distinct()
        ).all()
    )
    page = subscriptions[offset : offset + limit]
    if not page:
        return PlanSubscribedListOut(items=[])
    sub_ids = [sub.id for sub in page]
    template_ids = [sub.template_id for sub in page]
    templates = {
        row.id: row
        for row in db.scalars(select(PlanTemplate).where(PlanTemplate.id.in_(template_ids))).all()
    }
    creators = _users_by_id(
        db,
        [t.created_by_user_id for t in templates.values()],
    )
    tags_map = _tags_by_template(db, template_ids)
    workspaces = {
        row.id: row
        for row in db.scalars(
            select(Workspace).where(Workspace.id.in_([sub.workspace_id for sub in page]))
        ).all()
    }
    projects = {
        row.id: row
        for row in db.scalars(
            select(Project).where(Project.id.in_([sub.project_id for sub in page]))
        ).all()
    }
    segments = list(
        db.scalars(
            select(PlanSubscriptionSegment)
            .where(PlanSubscriptionSegment.subscription_id.in_(sub_ids))
            .order_by(PlanSubscriptionSegment.started_at.desc())
        ).all()
    )
    segments_by_sub: dict[uuid.UUID, list[PlanSubscriptionSegment]] = defaultdict(list)
    for segment in segments:
        segments_by_sub[segment.subscription_id].append(segment)
    runs = list(
        db.scalars(
            select(PlanApplyRun)
            .where(PlanApplyRun.subscription_id.in_(sub_ids))
            .order_by(PlanApplyRun.period_start.desc(), PlanApplyRun.created_at.desc())
        ).all()
    )
    runs_by_segment: dict[uuid.UUID, list[PlanApplyRun]] = defaultdict(list)
    pending_by_sub: dict[uuid.UUID, PlanApplyRun] = {}
    for run in runs:
        if run.segment_id is not None:
            runs_by_segment[run.segment_id].append(run)
        if run.status == "pending" and run.subscription_id is not None:
            pending_by_sub.setdefault(run.subscription_id, run)
    items_map = _items_by_run(db, [run.id for run in runs if run.status == "applied"])
    items: list[PlanSubscribedRowOut] = []
    for sub in page:
        template = templates.get(sub.template_id)
        if template is None:
            continue
        workspace = workspaces.get(sub.workspace_id)
        project = projects.get(sub.project_id)
        card = _card(template, creators.get(template.created_by_user_id), tags_map[template.id])
        segment_outs: list[PlanSubscribedSegmentOut] = []
        for segment in segments_by_sub[sub.id]:
            segment_runs = runs_by_segment[segment.id]
            applied_runs = [run for run in segment_runs if run.status == "applied"]
            run_outs = [
                _imported_run_out(run, items_map.get(run.id, [])) for run in applied_runs
            ]
            flat_items = [item for run_out in run_outs for item in run_out.items]
            segment_outs.append(
                PlanSubscribedSegmentOut(
                    started_at=segment.started_at,
                    ended_at=segment.ended_at,
                    runs=run_outs,
                    items=flat_items,
                )
            )
        pending = pending_by_sub.get(sub.id)
        items.append(
            PlanSubscribedRowOut(
                id=str(sub.id),
                template_id=str(template.id),
                title=card.title,
                usage_kind=card.usage_kind,
                period_kind=card.period_kind,
                visibility=card.visibility,
                creator=card.creator,
                tags=card.tags,
                use_count=card.use_count,
                workspace_id=str(sub.workspace_id),
                workspace_name=workspace.name if workspace else "",
                project_id=str(sub.project_id),
                project_name=project.name if project else "",
                segments=segment_outs,
                pending_run=_pending_out(pending) if pending else None,
            )
        )
    return PlanSubscribedListOut(items=items)


def list_plan_notifications(
    db: Session,
    user: User,
    *,
    limit: int = DEFAULT_LIMIT,
    offset: int = 0,
) -> PlanNotificationListOut:
    limit, offset = _page(limit, offset)
    notes = list(
        db.scalars(
            select(PlanNotification)
            .where(PlanNotification.user_id == user.id)
            .order_by(
                PlanNotification.read_at.asc().nulls_first(),
                PlanNotification.created_at.desc(),
            )
            .offset(offset)
            .limit(limit)
        ).all()
    )
    unread_count = int(
        db.scalar(
            select(func.count()).select_from(PlanNotification).where(
                PlanNotification.user_id == user.id,
                PlanNotification.read_at.is_(None),
            )
        )
        or 0
    )
    pending_runs = list(
        db.scalars(
            select(PlanApplyRun)
            .where(
                PlanApplyRun.actor_user_id == user.id,
                PlanApplyRun.status == "pending",
            )
            .order_by(PlanApplyRun.period_start.desc())
        ).all()
    )
    pending_by_id = {run.id: run for run in pending_runs}
    items = [
        PlanNotificationOut(
            id=str(note.id),
            kind=note.kind,
            template_id=str(note.template_id) if note.template_id else None,
            subscription_id=str(note.subscription_id) if note.subscription_id else None,
            apply_run_id=str(note.apply_run_id) if note.apply_run_id else None,
            read_at=note.read_at,
            created_at=note.created_at,
            meta=dict(note.meta or {}),
            pending_run=(
                _pending_out(pending_by_id[note.apply_run_id])
                if note.apply_run_id is not None and note.apply_run_id in pending_by_id
                else None
            ),
        )
        for note in notes
    ]
    return PlanNotificationListOut(
        items=items,
        unread_count=unread_count,
        pending_runs=[_pending_out(run) for run in pending_runs],
    )
