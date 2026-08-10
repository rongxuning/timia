"""Pydantic schemas for the sticky-note API."""

from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator

# ---------------------------------------------------------------------------
# Inputs
# ---------------------------------------------------------------------------

# Source enums exposed to clients
AttachmentTypeStr = Literal["text", "image", "audio", "video", "file"]
LocationSourceStr = Literal["gps", "ip", "manual"]


class StickyNoteLocationIn(BaseModel):
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    accuracy_m: float | None = Field(default=None, ge=0)
    name: str | None = Field(default=None, max_length=500)
    source: LocationSourceStr = "gps"


class StickyNoteAttachmentIn(BaseModel):
    attachment_type: AttachmentTypeStr
    filename: str = Field(min_length=1, max_length=255)
    mime_type: str = Field(min_length=1, max_length=100)
    byte_size: int = Field(ge=0, le=50 * 1024 * 1024)  # 50 MB cap
    width_px: int | None = Field(default=None, ge=1, le=20000)
    height_px: int | None = Field(default=None, ge=1, le=20000)
    duration_ms: int | None = Field(default=None, ge=0, le=24 * 60 * 60 * 1000)


class StickyNoteCreate(BaseModel):
    title: str | None = Field(default=None, max_length=200)
    content: str = Field(min_length=1, max_length=10000)
    recorded_at: datetime | None = None
    timezone: str = Field(default="Asia/Shanghai", min_length=1, max_length=64)
    location: StickyNoteLocationIn | None = None
    attachments: list[StickyNoteAttachmentIn] = Field(default_factory=list, max_length=9)
    auto_parse: bool = False

    @field_validator("content")
    @classmethod
    def _strip_content(cls, v: str) -> str:
        v2 = v.strip()
        if not v2:
            raise ValueError("content must not be blank")
        return v2


class StickyNoteUpdate(BaseModel):
    """Only the editable fields; everything else is append-only."""

    title: str | None = Field(default=None, max_length=200)
    content: str | None = Field(default=None, min_length=1, max_length=10000)
    location_name: str | None = Field(default=None, max_length=500)


# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------


class StickyNoteLocationOut(BaseModel):
    lat: float
    lng: float
    accuracy_m: float | None = None
    name: str | None = None
    source: str | None = None


class StickyNoteAttachmentOut(BaseModel):
    id: str
    attachment_type: str
    storage_url: str
    filename: str
    mime_type: str
    byte_size: int
    duration_ms: int | None = None
    width_px: int | None = None
    height_px: int | None = None
    transcript: str | None = None
    ocr_text: str | None = None
    created_at: datetime


class StickyNoteOut(BaseModel):
    id: str
    owner_user_id: str
    title: str | None
    content: str
    recorded_at: datetime
    created_at: datetime
    timezone: str
    location: StickyNoteLocationOut | None = None
    device_kind: str | None = None
    archived_at: datetime | None = None
    converted_count: int = 0
    attachments: list[StickyNoteAttachmentOut] = Field(default_factory=list)
    latest_parse: "StickyNoteAIParseOut | None" = None


# ---------------------------------------------------------------------------
# AI parse
# ---------------------------------------------------------------------------


class StickyNoteParseRequest(BaseModel):
    """A friendlier parse request for sticky notes — no selected_date.

    The model is told to infer a date from the text itself.
    """

    text: str = Field(min_length=1, max_length=2000)
    timezone: str = Field(default="Asia/Shanghai", min_length=1, max_length=100)
    reference_time: datetime

    @field_validator("text")
    @classmethod
    def _strip_text(cls, v: str) -> str:
        v2 = v.strip()
        if not v2:
            raise ValueError("text must not be blank")
        return v2


class NaturalLanguageTaskDraft(BaseModel):
    """Mirrors ``app.schemas.views.schedule.NaturalLanguageTaskDraft``.

    Duplicated here so the sticky-note API does not require clients to know
    about the schedule view schema.
    """

    title: str
    body: str | None = None
    start_at: datetime | None = None
    end_at: datetime | None = None
    all_day: bool = False
    status: Literal["todo", "doing", "done", "archived"] = "todo"
    priority: Literal["1", "2", "3", "4"] = "1"
    location: str | None = None
    workspace_name: str | None = None
    project_name: str | None = None
    assignee_name: str | None = None
    participant_names: list[str] = Field(default_factory=list)
    recurrence_text: str | None = None


class StickyNoteAIParseOut(BaseModel):
    id: str
    sticky_note_id: str
    parse_status: Literal["pending", "success", "failed", "skipped"]
    parse_provider: str | None = None
    parse_latency_ms: int | None = None
    draft: NaturalLanguageTaskDraft | None = None
    confidence: float | None = None
    assumptions: list[str] = Field(default_factory=list)
    missing_fields: list[str] = Field(default_factory=list)
    ambiguities: list[str] = Field(default_factory=list)
    converted_item_id: str | None = None
    converted_at: datetime | None = None
    error_code: str | None = None
    error_message: str | None = None
    created_at: datetime


# ---------------------------------------------------------------------------
# Convert
# ---------------------------------------------------------------------------


class StickyNoteConvertRequest(BaseModel):
    """Finalize a parse into a real Item.

    ``workspace_id`` / ``project_id`` are required (callers must have already
    matched the AI's ``workspace_name`` / ``project_name`` against their own
    workspace/project list, or chosen one manually). The convenience endpoint
    falls back to the user's most-recently-active workspace if these are
    omitted *and* the request is shaped via the auto-fallback path.

    If ``item_id`` is provided, the endpoint will NOT create a new item — it
    simply marks the parse as pointing at the given existing item. This is the
    "link" path used when the task drawer creates the item first and the
    sticky note is just recording the relationship.
    """

    parse_id: str
    workspace_id: str
    project_id: str
    field_overrides: dict[str, Any] = Field(default_factory=dict)
    item_id: str | None = None


class StickyNoteConvertResponse(BaseModel):
    item: dict[str, Any]  # ItemOut (kept loose to avoid circular import)
    sticky_note: StickyNoteOut
    parse: StickyNoteAIParseOut


# ---------------------------------------------------------------------------
# List query
# ---------------------------------------------------------------------------


class StickyNoteListOut(BaseModel):
    items: list[StickyNoteOut]
    next_cursor: str | None = None


# Late-resolve forward reference
StickyNoteOut.model_rebuild()
