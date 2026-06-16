"""Workspace activity timeline view."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.activity import ActivityLog
from app.models.user import User
from app.models.workspace import Workspace
from app.schemas.views.activity import ActivityTimelineItemOut, WorkspaceActivityViewOut
from app.services.permissions import require_workspace_member
from app.services.views.formatting import entity_type_label, format_ymd_hm, short_id


def build_workspace_activity_view(
    db: Session,
    workspace_id: uuid.UUID,
    user: User,
    *,
    limit: int = 200,
) -> WorkspaceActivityViewOut:
    require_workspace_member(db, workspace_id, user)
    w = db.get(Workspace, workspace_id)
    if not w:
        raise ValueError("workspace_not_found")

    cap = min(max(limit, 1), 200)
    rows = db.scalars(
        select(ActivityLog)
        .where(ActivityLog.workspace_id == workspace_id)
        .order_by(ActivityLog.created_at.desc())
        .limit(cap)
    ).all()

    items: list[ActivityTimelineItemOut] = []
    for a in rows:
        actor_id = str(a.actor_user_id)
        entity_id = str(a.entity_id)
        items.append(
            ActivityTimelineItemOut(
                id=str(a.id),
                actor_user_id=actor_id,
                actor_user_id_short=short_id(actor_id),
                entity_type=a.entity_type,
                entity_type_label=entity_type_label(a.entity_type),
                entity_id=entity_id,
                entity_id_short=short_id(entity_id),
                action=a.action,
                metadata=a.meta or {},
                created_at=a.created_at,
                created_at_label=format_ymd_hm(a.created_at),
            )
        )

    latest_label = items[0].created_at_label if items else None
    return WorkspaceActivityViewOut(
        workspace_id=str(w.id),
        name=w.name,
        description=w.description,
        total_count=len(items),
        latest_at_label=latest_label,
        items=items,
    )
