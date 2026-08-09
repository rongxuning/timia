"""Sticky note HTTP routes.

All endpoints require a valid Bearer token. Every read is gated by
``owner_user_id == current_user.id``; any other-user id returns 404 to
avoid leaking the existence of someone else's note.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.deps import get_db
from app.models.user import User
from app.schemas.item import ItemOut
from app.schemas.sticky_note import (
    StickyNoteAIParseOut,
    StickyNoteConvertRequest,
    StickyNoteConvertResponse,
    StickyNoteCreate,
    StickyNoteListOut,
    StickyNoteOut,
    StickyNoteUpdate,
)
from app.services.sticky_note_api import (
    archive_sticky_note,
    convert_sticky_note_to_item,
    create_sticky_note,
    get_sticky_note,
    list_sticky_note_parses,
    list_sticky_notes,
    trigger_sticky_note_parse,
    update_sticky_note,
)
from app.services.sticky_note_ai import parse_row_to_out
from app.services.item_api import build_item_out

router = APIRouter(prefix="/sticky-notes", tags=["sticky-notes"])


# ---------------------------------------------------------------------------
# List / Create
# ---------------------------------------------------------------------------


@router.get("", response_model=StickyNoteListOut)
def get_sticky_notes(
    limit: int = Query(20, ge=1, le=100),
    cursor: str | None = Query(None),
    include_archived: bool = Query(False),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return list_sticky_notes(
        db, user, limit=limit, cursor=cursor, include_archived=include_archived
    )


@router.post("", response_model=StickyNoteOut, status_code=status.HTTP_201_CREATED)
def post_sticky_note(
    payload: StickyNoteCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return create_sticky_note(db, user, payload)


# ---------------------------------------------------------------------------
# Single note
# ---------------------------------------------------------------------------


@router.get("/{note_id}", response_model=StickyNoteOut)
def get_sticky_note_route(
    note_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return get_sticky_note(db, user, note_id)


@router.patch("/{note_id}", response_model=StickyNoteOut)
def patch_sticky_note_route(
    note_id: uuid.UUID,
    payload: StickyNoteUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return update_sticky_note(db, user, note_id, payload)


@router.delete("/{note_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_sticky_note_route(
    note_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    archive_sticky_note(db, user, note_id)
    return None


# ---------------------------------------------------------------------------
# AI parse
# ---------------------------------------------------------------------------


@router.post("/{note_id}/ai-parse", response_model=StickyNoteAIParseOut)
def post_ai_parse(
    note_id: uuid.UUID,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    parse = trigger_sticky_note_parse(db, user, note_id)
    return parse_row_to_out(parse)


@router.get("/{note_id}/parses", response_model=list[StickyNoteAIParseOut])
def get_parses(
    note_id: uuid.UUID,
    latest: bool = Query(False, description="If true, return only the latest parse attempt"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    rows = list_sticky_note_parses(db, user, note_id, latest=latest)
    if latest:
        return [parse_row_to_out(rows[0])] if rows else []
    return [parse_row_to_out(p) for p in rows]


# ---------------------------------------------------------------------------
# Convert
# ---------------------------------------------------------------------------


@router.post("/{note_id}/convert", response_model=StickyNoteConvertResponse)
def post_convert(
    note_id: uuid.UUID,
    payload: StickyNoteConvertRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item, note, parse = convert_sticky_note_to_item(db, user, note_id, payload)
    item_out = build_item_out(db, item)
    return StickyNoteConvertResponse(
        item=item_out.model_dump(mode="json"),
        sticky_note=get_sticky_note(db, user, note_id),
        parse=parse_row_to_out(parse),
    )
