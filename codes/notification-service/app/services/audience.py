"""Resolve notification audiences against the shared identity tables."""

from __future__ import annotations

import uuid

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.identity import ProjectMember, User, WorkspaceMember
from app.schemas.notification import AudienceIn


def parse_uuid(value: str, detail: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except (TypeError, ValueError):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=detail) from None


def _unique(ids: list[uuid.UUID]) -> list[uuid.UUID]:
    seen: set[uuid.UUID] = set()
    out: list[uuid.UUID] = []
    for uid in ids:
        if uid in seen:
            continue
        seen.add(uid)
        out.append(uid)
    return out


def _active_users(db: Session, ids: list[uuid.UUID]) -> list[uuid.UUID]:
    if not ids:
        return []
    found = set(
        db.scalars(select(User.id).where(User.id.in_(ids), User.status == "active")).all()
    )
    return [uid for uid in ids if uid in found]


def resolve_recipients(
    db: Session,
    audience: AudienceIn,
    sender_id: uuid.UUID | None,
) -> list[uuid.UUID]:
    if audience.type == "user_ids":
        ids = [parse_uuid(value, "invalid_audience") for value in audience.user_ids]
    elif audience.type == "project_id":
        if not audience.project_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_audience")
        project_id = parse_uuid(audience.project_id, "invalid_audience")
        ids = list(
            db.scalars(
                select(ProjectMember.user_id)
                .join(User, User.id == ProjectMember.user_id)
                .where(
                    ProjectMember.project_id == project_id,
                    ProjectMember.status == "active",
                    User.status == "active",
                )
                .order_by(ProjectMember.user_id.asc())
            ).all()
        )
    elif audience.type == "workspace_id":
        if not audience.workspace_id:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_audience")
        workspace_id = parse_uuid(audience.workspace_id, "invalid_audience")
        ids = list(
            db.scalars(
                select(WorkspaceMember.user_id)
                .join(User, User.id == WorkspaceMember.user_id)
                .where(
                    WorkspaceMember.workspace_id == workspace_id,
                    WorkspaceMember.status == "active",
                    User.status == "active",
                )
                .order_by(WorkspaceMember.user_id.asc())
            ).all()
        )
    else:
        ids = list(db.scalars(select(User.id).where(User.status == "active").order_by(User.id.asc())).all())

    if audience.type == "user_ids":
        ids = _active_users(db, _unique(ids))
    else:
        ids = _unique(ids)

    exclude = {parse_uuid(value, "invalid_audience") for value in audience.exclude_user_ids}
    if sender_id is not None:
        exclude.add(sender_id)
    return [uid for uid in ids if uid not in exclude]
