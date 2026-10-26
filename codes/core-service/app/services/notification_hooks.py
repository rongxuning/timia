"""Load names and fan out notification intents after a successful commit."""

from __future__ import annotations

import logging
import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.item import Item
from app.models.project import Project, ProjectMember
from app.models.user import User
from app.models.workspace import Workspace
from app.services.notification_audience import (
    coerce_user_ids,
    plan_membership_added,
    plan_participant_changes,
    plan_task_created,
)
from app.services.notification_notify import dispatch_notifications

logger = logging.getLogger(__name__)


def _task_link(item: Item) -> str:
    return f"/workspace/{item.workspace_id}/projects/{item.project_id}/items/{item.id}"


def notify_item_created(db: Session, item: Item, actor: User) -> None:
    try:
        project = db.get(Project, item.project_id)
        member_ids = list(
            db.scalars(
                select(ProjectMember.user_id).where(
                    ProjectMember.project_id == item.project_id,
                    ProjectMember.workspace_id == item.workspace_id,
                    ProjectMember.status == "active",
                )
            ).all()
        )
        intents = plan_task_created(
            actor_id=actor.id,
            actor_name=actor.display_name,
            task_title=item.title,
            project_name=project.name if project else "",
            link=_task_link(item),
            project_member_ids=member_ids,
            participant_ids=coerce_user_ids(item.participant_user_ids),
            assignee_id=item.assignee_user_id,
            creator_id=item.created_by_user_id,
        )
        dispatch_notifications(intents)
    except Exception:
        logger.exception("notify_item_created failed item=%s", getattr(item, "id", None))


def notify_item_participants_changed(
    db: Session,
    item: Item,
    actor: User,
    before_ids,
    after_ids,
) -> None:
    try:
        intents = plan_participant_changes(
            actor_id=actor.id,
            actor_name=actor.display_name,
            task_title=item.title,
            link=_task_link(item),
            assignee_id=item.assignee_user_id,
            creator_id=item.created_by_user_id,
            before_participant_ids=coerce_user_ids(before_ids),
            after_participant_ids=coerce_user_ids(after_ids),
        )
        dispatch_notifications(intents)
    except Exception:
        logger.exception("notify_item_participants_changed failed item=%s", getattr(item, "id", None))


def notify_workspace_member_added(
    db: Session,
    workspace: Workspace,
    actor: User,
    target_user_id: uuid.UUID,
) -> None:
    try:
        intent = plan_membership_added(
            scenario_key="workspace_member_added",
            actor_id=actor.id,
            actor_name=actor.display_name,
            target_user_id=target_user_id,
            link=f"/workspace/{workspace.id}",
            variables={
                "actor_name": actor.display_name,
                "workspace_name": workspace.name,
            },
        )
        if intent:
            dispatch_notifications([intent])
    except Exception:
        logger.exception("notify_workspace_member_added failed workspace=%s", workspace.id)


def notify_project_member_added(
    db: Session,
    project: Project,
    actor: User,
    target_user_id: uuid.UUID,
) -> None:
    try:
        workspace = db.get(Workspace, project.workspace_id)
        intent = plan_membership_added(
            scenario_key="project_member_added",
            actor_id=actor.id,
            actor_name=actor.display_name,
            target_user_id=target_user_id,
            link=f"/workspace/{project.workspace_id}/projects/{project.id}",
            variables={
                "actor_name": actor.display_name,
                "project_name": project.name,
                "workspace_name": workspace.name if workspace else "",
            },
        )
        if intent:
            dispatch_notifications([intent])
    except Exception:
        logger.exception("notify_project_member_added failed project=%s", project.id)
