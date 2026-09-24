"""CRUD and call-order for server-managed LLM keys.

Runtime selection prefers enabled keys that are not cooling down, lowest
priority first. The first of those is the primary key; the rest are standbys.
Keys come only from this table.
"""

from __future__ import annotations

import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
from urllib.parse import urlparse

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.db.session import SessionLocal
from app.models._mixins import utcnow
from app.models.llm_api_key import LlmApiKey
from typing import Literal

from app.schemas.llm_api_key import (
    LlmApiKeyCreate,
    LlmApiKeyListOut,
    LlmApiKeyOut,
    LlmApiKeyUpdate,
)

AUTH_COOLDOWN = timedelta(minutes=30)
QUOTA_COOLDOWN = timedelta(minutes=10)
TRANSIENT_COOLDOWN = timedelta(minutes=2)


class LlmApiKeyError(ValueError):
    pass


@dataclass(frozen=True)
class LlmKeyCandidate:
    id: uuid.UUID | None
    name: str
    base_url: str
    api_key: str
    model: str
    timeout_seconds: float


def mask_api_key(value: str) -> str:
    tail = value[-4:] if len(value) >= 4 else value
    return f"••••{tail}"


def normalize_name(value: str) -> str:
    name = value.strip()
    if not name or len(name) > 80:
        raise LlmApiKeyError("name_invalid")
    return name


def normalize_base_url(value: str) -> str:
    url = value.strip().rstrip("/")
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc or len(url) > 300:
        raise LlmApiKeyError("invalid_base_url")
    return url


def classify_provider_failure(status_code: int | None, body: str) -> timedelta:
    text = body.lower()
    if status_code in {401, 403} or any(
        token in text for token in ("1004", "not authorized", "authentication", "invalid api key")
    ):
        return AUTH_COOLDOWN
    if status_code in {402, 429} or any(
        token in text for token in ("1008", "1002", "insufficient balance", "rate limit")
    ):
        return QUOTA_COOLDOWN
    return TRANSIENT_COOLDOWN


def public_provider_error(status_code: int | None, body: str, api_key: str) -> str:
    text = " ".join(body.split())
    if api_key:
        text = text.replace(api_key, "••••")
    prefix = f"HTTP {status_code}: " if status_code is not None else ""
    return (prefix + text)[:300]


def to_candidate(row: LlmApiKey) -> LlmKeyCandidate:
    return LlmKeyCandidate(
        id=row.id,
        name=row.name,
        base_url=row.base_url.rstrip("/"),
        api_key=row.api_key,
        model=row.model,
        timeout_seconds=row.timeout_seconds or settings.minimax_timeout_seconds,
    )


def select_call_order(rows: list[LlmApiKey], *, now: datetime) -> list[LlmKeyCandidate]:
    """Enabled keys, ready ones first. Cooling keys are used only if none are ready."""
    enabled = [row for row in rows if row.enabled]
    ready = [
        row for row in enabled if row.cooldown_until is None or row.cooldown_until <= now
    ]
    cooling = [row for row in enabled if row not in ready]
    chosen = ready if ready else cooling
    chosen.sort(key=lambda row: (row.priority, row.created_at, str(row.id)))
    return [to_candidate(row) for row in chosen]


def list_call_candidates(db: Session) -> list[LlmKeyCandidate]:
    rows = list(db.scalars(select(LlmApiKey)).all())
    return select_call_order(rows, now=utcnow())


def _primary_id(rows: list[LlmApiKey]) -> uuid.UUID | None:
    enabled = [row for row in rows if row.enabled]
    if not enabled:
        return None
    enabled.sort(key=lambda row: (row.priority, row.created_at, str(row.id)))
    return enabled[0].id


def _role(row: LlmApiKey, primary: uuid.UUID | None) -> Literal["primary", "standby", "disabled"]:
    if not row.enabled:
        return "disabled"
    if row.id == primary:
        return "primary"
    return "standby"


def to_out(row: LlmApiKey, primary: uuid.UUID | None) -> LlmApiKeyOut:
    return LlmApiKeyOut(
        id=str(row.id),
        name=row.name,
        base_url=row.base_url,
        api_key_hint=mask_api_key(row.api_key),
        model=row.model,
        enabled=row.enabled,
        priority=row.priority,
        timeout_seconds=row.timeout_seconds,
        role=_role(row, primary),
        cooldown_until=row.cooldown_until,
        last_status=row.last_status,
        last_error=row.last_error,
        last_used_at=row.last_used_at,
        created_at=row.created_at,
        updated_at=row.updated_at,
    )


def _ordered_rows(db: Session) -> list[LlmApiKey]:
    return list(
        db.scalars(
            select(LlmApiKey).order_by(LlmApiKey.priority.asc(), LlmApiKey.created_at.asc())
        ).all()
    )


def list_keys(db: Session) -> LlmApiKeyListOut:
    rows = _ordered_rows(db)
    primary = _primary_id(rows)
    return LlmApiKeyListOut(keys=[to_out(row, primary) for row in rows])


def _commit_name(db: Session) -> None:
    try:
        db.commit()
    except IntegrityError as error:
        db.rollback()
        raise LlmApiKeyError("name_taken") from error


def create_key(db: Session, payload: LlmApiKeyCreate) -> LlmApiKeyOut:
    row = LlmApiKey(
        name=normalize_name(payload.name),
        base_url=normalize_base_url(payload.base_url),
        api_key=payload.api_key.strip(),
        model=payload.model.strip(),
        enabled=payload.enabled,
        priority=payload.priority,
        timeout_seconds=payload.timeout_seconds,
    )
    db.add(row)
    _commit_name(db)
    db.refresh(row)
    primary = _primary_id(_ordered_rows(db))
    return to_out(row, primary)


def _get(db: Session, key_id: uuid.UUID) -> LlmApiKey:
    row = db.get(LlmApiKey, key_id)
    if row is None:
        raise LlmApiKeyError("not_found")
    return row


def update_key(db: Session, key_id: uuid.UUID, payload: LlmApiKeyUpdate) -> LlmApiKeyOut:
    row = _get(db, key_id)
    fields = payload.model_fields_set
    if "name" in fields and payload.name is not None:
        row.name = normalize_name(payload.name)
    if "base_url" in fields and payload.base_url is not None:
        row.base_url = normalize_base_url(payload.base_url)
    if "api_key" in fields and payload.api_key is not None:
        row.api_key = payload.api_key.strip()
    if "model" in fields and payload.model is not None:
        row.model = payload.model.strip()
    if "enabled" in fields and payload.enabled is not None:
        row.enabled = payload.enabled
    if "priority" in fields and payload.priority is not None:
        row.priority = payload.priority
    if "timeout_seconds" in fields:
        row.timeout_seconds = payload.timeout_seconds
    _commit_name(db)
    db.refresh(row)
    primary = _primary_id(_ordered_rows(db))
    return to_out(row, primary)


def delete_key(db: Session, key_id: uuid.UUID) -> None:
    row = _get(db, key_id)
    db.delete(row)
    db.commit()


def make_primary(db: Session, key_id: uuid.UUID) -> LlmApiKeyOut:
    row = _get(db, key_id)
    rows = _ordered_rows(db)
    lowest = min(item.priority for item in rows)
    tied = any(item.id != row.id and item.priority == lowest for item in rows)
    if row.priority != lowest or tied:
        row.priority = lowest - 1
        db.commit()
        db.refresh(row)
    if not row.enabled:
        row.enabled = True
        db.commit()
        db.refresh(row)
    primary = _primary_id(_ordered_rows(db))
    return to_out(row, primary)


def probe_stored_key(
    db: Session,
    key_id: uuid.UUID,
    poster: Callable[[LlmKeyCandidate], object],
) -> tuple[bool, LlmApiKeyOut]:
    row = _get(db, key_id)
    candidate = to_candidate(row)
    try:
        poster(candidate)
    except Exception as error:
        record_failure(candidate, error)
        ok = False
    else:
        record_success(candidate)
        ok = True
    db.refresh(row)
    return ok, to_out(row, _primary_id(_ordered_rows(db)))


def record_success(candidate: LlmKeyCandidate) -> None:
    if candidate.id is None:
        return
    _persist(
        candidate.id,
        last_status="available",
        last_error=None,
        last_used_at=utcnow(),
        cooldown_until=None,
    )


def record_failure(candidate: LlmKeyCandidate, error: BaseException) -> None:
    if candidate.id is None:
        return
    status_code, body = _error_parts(error)
    message = public_provider_error(status_code, body, candidate.api_key)
    _persist(
        candidate.id,
        last_status="unavailable",
        last_error=message,
        cooldown_until=utcnow() + classify_provider_failure(status_code, body),
    )


def _error_parts(error: BaseException) -> tuple[int | None, str]:
    response = getattr(error, "response", None)
    status_code = getattr(response, "status_code", None)
    if response is not None:
        try:
            body = response.text
        except Exception:
            body = str(error)
    else:
        body = str(error)
    return status_code, body or type(error).__name__


def _persist(key_id: uuid.UUID, **fields: object) -> None:
    db = SessionLocal()
    try:
        row = db.get(LlmApiKey, key_id)
        if row is None:
            return
        for name, value in fields.items():
            setattr(row, name, value)
        db.commit()
    finally:
        db.close()
