import uuid

from sqlalchemy.orm import Session

from app.models.activity import ActivityLog


def log_activity(
    db: Session,
    *,
    workspace_id: uuid.UUID,
    actor_user_id: uuid.UUID,
    entity_type: str,
    entity_id: uuid.UUID,
    action: str,
    metadata: dict | None = None,
):
    row = ActivityLog(
        workspace_id=workspace_id,
        actor_user_id=actor_user_id,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        meta=metadata or {},
    )
    db.add(row)

