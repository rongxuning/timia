"""Sticky-note AI parse wrapper.

Calls the (slightly generalized) MiniMax parser, maps the response onto a
``StickyNoteAIParse`` row, and returns it.
"""

from __future__ import annotations

import time
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.sticky_note import (
    PARSE_STATUS_FAILED,
    PARSE_STATUS_SUCCESS,
    StickyNote,
    StickyNoteAIParse,
)
from app.schemas.sticky_note import StickyNoteAIParseOut
from app.services.natural_language_schedule import (
    NaturalLanguageConfigurationError,
    NaturalLanguageProviderError,
    parse_natural_language_task_without_date,
)


def _text_for_parse(sticky_note: StickyNote) -> str:
    """Prefer ``content``; fall back to ``title`` so empty notes still get parsed."""
    content = (sticky_note.content or "").strip()
    if content:
        return content
    return (sticky_note.title or "").strip()


def run_sticky_note_parse(
    db: Session, sticky_note: StickyNote
) -> tuple[StickyNoteAIParse, NaturalLanguageConfigurationError | NaturalLanguageProviderError | None]:
    """Run a parse attempt and persist the result.

    Returns the new ``StickyNoteAIParse`` row and a possible error (the row is
    always written — the error decides ``parse_status`` but does not raise).
    """
    text = _text_for_parse(sticky_note)
    if not text:
        parse = StickyNoteAIParse(
            sticky_note_id=sticky_note.id,
            parse_status=PARSE_STATUS_FAILED,
            parse_provider=settings.minimax_model,
            error_code="empty_text",
            error_message="便利贴无可解析文本",
        )
        db.add(parse)
        db.flush()
        return parse, NaturalLanguageProviderError("便利贴无可解析文本")

    reference_time = datetime.now(timezone.utc)
    started = time.perf_counter()
    parse = StickyNoteAIParse(
        sticky_note_id=sticky_note.id,
        parse_status="pending",
        parse_provider=settings.minimax_model,
    )
    db.add(parse)
    db.flush()

    try:
        result = parse_natural_language_task_without_date(
            text=text,
            timezone=sticky_note.timezone or "Asia/Shanghai",
            reference_time=reference_time,
        )
    except NaturalLanguageConfigurationError as err:
        parse.parse_status = PARSE_STATUS_FAILED
        parse.error_code = "ai_unavailable"
        parse.error_message = str(err)
        parse.parse_latency_ms = int((time.perf_counter() - started) * 1000)
        db.flush()
        return parse, err
    except NaturalLanguageProviderError as err:
        parse.parse_status = PARSE_STATUS_FAILED
        parse.error_code = "ai_invalid_response"
        parse.error_message = str(err)
        parse.parse_latency_ms = int((time.perf_counter() - started) * 1000)
        db.flush()
        return parse, err

    draft = result.draft.model_dump(mode="json")
    parse.parse_status = PARSE_STATUS_SUCCESS
    parse.draft_json = draft
    parse.confidence = result.confidence
    parse.assumptions = list(result.assumptions or [])
    parse.missing_fields = list(result.missing_fields or [])
    parse.ambiguities = list(result.ambiguities or [])
    parse.parse_latency_ms = int((time.perf_counter() - started) * 1000)
    db.flush()
    return parse, None


def parse_row_to_out(parse: StickyNoteAIParse) -> StickyNoteAIParseOut:
    """Map an ORM row to the response schema."""
    draft_data: dict[str, Any] | None = None
    if parse.parse_status == PARSE_STATUS_SUCCESS and isinstance(parse.draft_json, dict):
        from app.schemas.sticky_note import NaturalLanguageTaskDraft

        try:
            draft_data = NaturalLanguageTaskDraft.model_validate(parse.draft_json).model_dump(
                mode="json"
            )
        except Exception:
            draft_data = parse.draft_json  # fall back to raw

    return StickyNoteAIParseOut(
        id=str(parse.id),
        sticky_note_id=str(parse.sticky_note_id),
        parse_status=parse.parse_status,  # type: ignore[arg-type]
        parse_provider=parse.parse_provider,
        parse_latency_ms=parse.parse_latency_ms,
        draft=draft_data,  # type: ignore[arg-type]
        confidence=parse.confidence,
        assumptions=list(parse.assumptions or []),
        missing_fields=list(parse.missing_fields or []),
        ambiguities=list(parse.ambiguities or []),
        converted_item_id=str(parse.converted_item_id) if parse.converted_item_id else None,
        converted_at=parse.converted_at,
        error_code=parse.error_code,
        error_message=parse.error_message,
        created_at=parse.created_at,
    )
