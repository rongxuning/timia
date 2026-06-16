from datetime import datetime

from pydantic import BaseModel, Field


class ActivityTimelineItemOut(BaseModel):
    id: str
    actor_user_id: str
    actor_user_id_short: str
    entity_type: str
    entity_type_label: str
    entity_id: str
    entity_id_short: str
    action: str
    metadata: dict = Field(default_factory=dict)
    created_at: datetime
    created_at_label: str


class WorkspaceActivityViewOut(BaseModel):
    workspace_id: str
    name: str
    description: str | None = None
    total_count: int
    latest_at_label: str | None = None
    items: list[ActivityTimelineItemOut]
