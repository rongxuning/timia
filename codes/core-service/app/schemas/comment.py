from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel


class CommentCreate(BaseModel):
    body: str
    parent_comment_id: UUID | None = None


class CommentUpdate(BaseModel):
    completion_status: Literal["pending", "done"]


class CommentOut(BaseModel):
    id: str
    author_user_id: str
    author_display_name: str
    body: str
    created_at: datetime
    deleted_at: datetime | None
    parent_comment_id: str | None
    completion_status: str
