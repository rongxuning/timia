"""Sticky note business logic: CRUD + parse + convert.

Encapsulates permission checks (every query is gated by ``owner_user_id == user.id``)
and the bridge to the items table on convert.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.activity import ActivityLog
from app.models.item import Item
from app.models.project import Project
from app.models.sticky_note import (
    PARSE_STATUS_SUCCESS,
    StickyNote,
    StickyNoteAIParse,
    StickyNoteAttachment,
)
from app.models.user import User
from app.models.workspace import WorkspaceMember
from app.schemas.item import ItemCreate
from app.schemas.sticky_note import (
    StickyNoteAttachmentOut,
    StickyNoteConvertRequest,
    StickyNoteCreate,
    StickyNoteListOut,
    StickyNoteLocationOut,
    StickyNoteOut,
    StickyNoteUpdate,
)
from app.services.activity import log_activity
from app.services.item_api import (
    parse_assignee_id,
    parse_participant_ids,
    resolve_item_completed_at,
    validate_item_people,
)
from app.services.sticky_note_ai import parse_row_to_out, run_sticky_note_parse

# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _ensure_owner(note: StickyNote | None, user: User) -> StickyNote:
    """Return the note only if it belongs to ``user``. Otherwise 404.

    Returning 404 (not 403) avoids leaking the existence of other users' notes.
    """
    if not note or note.owner_user_id != user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="sticky_note_not_found")
    return note


def _load_note_or_404(db: Session, note_id: uuid.UUID, user: User) -> StickyNote:
    stmt = (
        select(StickyNote)
        .where(StickyNote.id == note_id)
        .options(
            selectinload(StickyNote.attachments),
            selectinload(StickyNote.parses),
        )
    )
    return _ensure_owner(db.scalars(stmt).first(), user)


def _ensure_not_archived(note: StickyNote) -> None:
    if note.archived_at is not None:
        raise HTTPException(
            status_code=status.HTTP_410_GONE, detail="sticky_note_archived"
        )


def _build_attachment_out(att: StickyNoteAttachment) -> StickyNoteAttachmentOut:
    return StickyNoteAttachmentOut(
        id=str(att.id),
        attachment_type=att.attachment_type,
        storage_url=att.storage_url,
        filename=att.storage_url.rsplit("/", 1)[-1] if "/" in att.storage_url else att.storage_url,
        mime_type=att.mime_type,
        byte_size=att.byte_size,
        duration_ms=att.duration_ms,
        width_px=att.width_px,
        height_px=att.height_px,
        transcript=att.transcript,
        ocr_text=att.ocr_text,
        created_at=att.created_at,
    )


def _build_note_out(
    note: StickyNote, latest_parse: StickyNoteAIParse | None = None
) -> StickyNoteOut:
    location = None
    if note.location_lat is not None and note.location_lng is not None:
        location = StickyNoteLocationOut(
            lat=note.location_lat,
            lng=note.location_lng,
            accuracy_m=note.location_accuracy_m,
            name=note.location_name,
            source=note.location_source,
        )
    return StickyNoteOut(
        id=str(note.id),
        owner_user_id=str(note.owner_user_id),
        title=note.title,
        content=note.content,
        recorded_at=note.recorded_at,
        created_at=note.created_at,
        timezone=note.timezone,
        location=location,
        device_kind=note.device_kind,
        archived_at=note.archived_at,
        converted_count=note.converted_count,
        attachments=[_build_attachment_out(a) for a in note.attachments],
        latest_parse=parse_row_to_out(latest_parse) if latest_parse else None,
    )


# ---------------------------------------------------------------------------
# CRUD
# ---------------------------------------------------------------------------


def create_sticky_note(db: Session, user: User, payload: StickyNoteCreate) -> StickyNoteOut:
    device_kind = "ios" if user.system_role or False else "web"  # overridden below
    # We don't actually want to use system_role for this — read the bearer
    # from the request in the router. For now, default to "web" and let the
    # router set the field if the JWT has a mobile audience.
    device_kind = "web"

    note = StickyNote(
        owner_user_id=user.id,
        title=payload.title,
        content=payload.content,
        recorded_at=payload.recorded_at or datetime.now(timezone.utc),
        timezone=payload.timezone,
        location_lat=payload.location.lat if payload.location else None,
        location_lng=payload.location.lng if payload.location else None,
        location_accuracy_m=payload.location.accuracy_m if payload.location else None,
        location_name=payload.location.name if payload.location else None,
        location_source=payload.location.source if payload.location else None,
        device_kind=device_kind,
        user_agent=None,
    )
    db.add(note)
    db.flush()

    for att in payload.attachments:
        db.add(
            StickyNoteAttachment(
                sticky_note_id=note.id,
                attachment_type=att.attachment_type,
                storage_url=f"local://{uuid.uuid4()}/{att.filename}",
                mime_type=att.mime_type,
                byte_size=att.byte_size,
                width_px=att.width_px,
                height_px=att.height_px,
                duration_ms=att.duration_ms,
            )
        )

    if payload.auto_parse:
        # Best-effort: errors are recorded on the parse row, not raised.
        run_sticky_note_parse(db, note)

    db.commit()
    db.refresh(note)
    return _build_note_out(note, latest_parse=note.parses[0] if note.parses else None)


def list_sticky_notes(
    db: Session,
    user: User,
    *,
    limit: int = 20,
    cursor: str | None = None,
    include_archived: bool = False,
) -> StickyNoteListOut:
    stmt = (
        select(StickyNote)
        .where(StickyNote.owner_user_id == user.id)
        .options(
            selectinload(StickyNote.attachments),
            selectinload(StickyNote.parses),
        )
        .order_by(StickyNote.recorded_at.desc(), StickyNote.id.desc())
        .limit(limit + 1)
    )
    if not include_archived:
        stmt = stmt.where(StickyNote.archived_at.is_(None))

    if cursor:
        try:
            cursor_iso = datetime.fromisoformat(cursor)
        except ValueError as exc:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_cursor"
            ) from exc
        # Stable secondary sort by id, so use composite cursor (recorded_at, id)
        cursor_id: uuid.UUID | None = None
        if "|" in cursor:
            _, id_str = cursor.split("|", 1)
            try:
                cursor_id = uuid.UUID(id_str)
            except ValueError as exc:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_cursor"
                ) from exc
            stmt = stmt.where(
                (StickyNote.recorded_at < cursor_iso)
                | ((StickyNote.recorded_at == cursor_iso) & (StickyNote.id < cursor_id))
            )
        else:
            stmt = stmt.where(StickyNote.recorded_at < cursor_iso)

    rows = db.scalars(stmt).all()
    has_more = len(rows) > limit
    rows = rows[:limit]

    next_cursor: str | None = None
    if has_more and rows:
        last = rows[-1]
        next_cursor = f"{last.recorded_at.isoformat()}|{last.id}"

    return StickyNoteListOut(
        items=[_build_note_out(n, latest_parse=n.parses[0] if n.parses else None) for n in rows],
        next_cursor=next_cursor,
    )


def get_sticky_note(db: Session, user: User, note_id: uuid.UUID) -> StickyNoteOut:
    note = _load_note_or_404(db, note_id, user)
    return _build_note_out(note, latest_parse=note.parses[0] if note.parses else None)


def update_sticky_note(
    db: Session, user: User, note_id: uuid.UUID, payload: StickyNoteUpdate
) -> StickyNoteOut:
    note = _load_note_or_404(db, note_id, user)
    _ensure_not_archived(note)

    if "title" in payload.model_fields_set:
        note.title = payload.title
    if "content" in payload.model_fields_set:
        note.content = (payload.content or "").strip()  # type: ignore[arg-type]
    if "location_name" in payload.model_fields_set:
        note.location_name = payload.location_name

    db.commit()
    db.refresh(note)
    return _build_note_out(note, latest_parse=note.parses[0] if note.parses else None)


def archive_sticky_note(db: Session, user: User, note_id: uuid.UUID) -> None:
    note = _load_note_or_404(db, note_id, user)
    if note.archived_at is None:
        note.archived_at = datetime.now(timezone.utc)
        db.commit()


# ---------------------------------------------------------------------------
# Parse
# ---------------------------------------------------------------------------


def trigger_sticky_note_parse(
    db: Session, user: User, note_id: uuid.UUID
) -> StickyNoteAIParse:
    note = _load_note_or_404(db, note_id, user)
    _ensure_not_archived(note)
    parse, _error = run_sticky_note_parse(db, note)
    db.commit()
    db.refresh(parse)
    return parse


def list_sticky_note_parses(
    db: Session, user: User, note_id: uuid.UUID, *, only_unconverted: bool = False
) -> list[StickyNoteAIParse]:
    _load_note_or_404(db, note_id, user)
    stmt = (
        select(StickyNoteAIParse)
        .where(StickyNoteAIParse.sticky_note_id == note_id)
        .order_by(StickyNoteAIParse.created_at.desc())
    )
    if only_unconverted:
        stmt = stmt.where(
            StickyNoteAIParse.parse_status == PARSE_STATUS_SUCCESS,
            StickyNoteAIParse.converted_item_id.is_(None),
        )
    return list(db.scalars(stmt).all())


# ---------------------------------------------------------------------------
# Convert
# ---------------------------------------------------------------------------


def _pick_fallback_workspace(db: Session, user: User) -> uuid.UUID:
    """Pick the user's most-recently-active workspace, or raise 400."""
    stmt = (
        select(WorkspaceMember.workspace_id)
        .where(WorkspaceMember.user_id == user.id, WorkspaceMember.status == "active")
        .order_by(WorkspaceMember.last_active_at.desc().nullslast(), WorkspaceMember.created_at.desc())
        .limit(1)
    )
    row = db.scalars(stmt).first()
    if not row:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="no_workspace_available",
        )
    return row


def convert_sticky_note_to_item(
    db: Session,
    user: User,
    note_id: uuid.UUID,
    payload: StickyNoteConvertRequest,
) -> tuple[Item, StickyNote, StickyNoteAIParse]:
    note = _load_note_or_404(db, note_id, user)
    _ensure_not_archived(note)

    parse = db.get(StickyNoteAIParse, uuid.UUID(payload.parse_id))
    if (
        not parse
        or parse.sticky_note_id != note.id
        or parse.parse_status != PARSE_STATUS_SUCCESS
        or parse.converted_item_id is not None
    ):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="parse_not_convertible"
        )

    # Resolve target workspace + project.
    workspace_id = uuid.UUID(payload.workspace_id) if payload.workspace_id else None
    project_id = uuid.UUID(payload.project_id) if payload.project_id else None
    auto_fallback = False
    if workspace_id is None or project_id is None:
        # Caller did not specify → use most-recent-active.
        workspace_id = _pick_fallback_workspace(db, user)
        # Pick the first project in that workspace.
        proj = db.scalar(
            select(Project).where(Project.workspace_id == workspace_id).order_by(Project.created_at.asc()).limit(1)
        )
        if not proj:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="no_project_in_workspace",
            )
        project_id = proj.id
        auto_fallback = True

    project = db.get(Project, project_id)
    if not project or project.workspace_id != workspace_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_project")

    # Build ItemCreate from parse + overrides.
    draft = (parse.draft_json or {}) if isinstance(parse.draft_json, dict) else {}
    overrides = payload.field_overrides or {}

    def _get(key: str, default: Any) -> Any:
        if key in overrides:
            return overrides[key]
        return draft.get(key, default)

    title = str(_get("title", "")).strip()
    if not title:
        title = note.title or note.content[:50]

    item_payload = ItemCreate(
        title=title,
        body=_get("body", None) or note.content,
        color="#FFFFFF",
        status=str(_get("status", "todo")),
        priority=str(_get("priority", "1")),
        start_at=_get("start_at", None),
        end_at=_get("end_at", None),
        completed_at=None,
        details=note.content if note.content else None,
        assignee_user_id=str(user.id),  # default to self
        participant_user_ids=[],
        location=_get("location", None),
    )

    assignee_id = parse_assignee_id(item_payload.assignee_user_id)
    participant_ids = parse_participant_ids(item_payload.participant_user_ids)
    validate_item_people(db, workspace_id, project_id, assignee_id, participant_ids)

    completed_at = resolve_item_completed_at(
        current_status=None,
        current_completed_at=None,
        next_status=item_payload.status,
        requested_completed_at=item_payload.completed_at,
        completed_at_was_set="completed_at" in item_payload.model_fields_set,
        now=datetime.now(timezone.utc),
    )

    item = Item(
        workspace_id=workspace_id,
        project_id=project_id,
        title=item_payload.title,
        body=item_payload.body,
        color=item_payload.color.upper(),
        status=item_payload.status,
        priority=item_payload.priority or "1",
        start_at=item_payload.start_at,
        end_at=item_payload.end_at,
        completed_at=completed_at,
        details=item_payload.details,
        created_by_user_id=user.id,
        assignee_user_id=assignee_id,
        participant_user_ids=participant_ids,
        location=item_payload.location,
        version=1,
    )
    db.add(item)
    db.flush()

    # Mark the parse as converted.
    parse.converted_item_id = item.id
    parse.converted_at = datetime.now(timezone.utc)
    note.converted_count = (note.converted_count or 0) + 1

    # Persist a fallback hint in the parse's assumptions so we can audit it later.
    if auto_fallback and isinstance(parse.assumptions, list):
        parse.assumptions = list(parse.assumptions) + [
            f"auto_fallback_workspace_id={workspace_id}",
            f"auto_fallback_project_id={project_id}",
        ]

    # Activity log on the new item (not on the note — the note has no workspace).
    log_activity(
        db,
        workspace_id=workspace_id,
        actor_user_id=user.id,
        entity_type="item",
        entity_id=item.id,
        action="create",
        metadata={
            "title": item.title,
            "project_id": str(project_id),
            "from_sticky_note_id": str(note.id),
            "from_sticky_note_parse_id": str(parse.id),
            "auto_fallback": auto_fallback,
        },
    )

    db.commit()
    db.refresh(item)
    db.refresh(note)
    db.refresh(parse)
    return item, note, parse
