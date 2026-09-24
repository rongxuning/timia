"""System-admin CRUD for LLM API keys. Not a workspace resource, so no activity log."""

import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.deps import require_system_admin
from app.db.deps import get_db
from app.models.user import User
from app.schemas.llm_api_key import (
    LlmApiKeyCreate,
    LlmApiKeyListOut,
    LlmApiKeyOut,
    LlmApiKeyProbeOut,
    LlmApiKeyUpdate,
)
from app.services.llm_api_keys import (
    LlmApiKeyError,
    create_key,
    delete_key,
    list_keys,
    make_primary,
    probe_stored_key,
    update_key,
)
from app.services.natural_language_schedule import probe_llm_key

router = APIRouter(prefix="/llm-api-keys", tags=["llm-api-keys"])


def _http_error(error: LlmApiKeyError) -> HTTPException:
    code = str(error)
    status_code = {
        "not_found": status.HTTP_404_NOT_FOUND,
        "name_taken": status.HTTP_409_CONFLICT,
    }.get(code, status.HTTP_400_BAD_REQUEST)
    return HTTPException(status_code=status_code, detail=code)


@router.get("", response_model=LlmApiKeyListOut)
def list_llm_api_keys(
    db: Session = Depends(get_db),
    _: User = Depends(require_system_admin),
):
    return list_keys(db)


@router.post("", response_model=LlmApiKeyOut, status_code=status.HTTP_201_CREATED)
def create_llm_api_key(
    payload: LlmApiKeyCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_system_admin),
):
    try:
        return create_key(db, payload)
    except LlmApiKeyError as error:
        raise _http_error(error) from error


@router.patch("/{key_id}", response_model=LlmApiKeyOut)
def update_llm_api_key(
    key_id: uuid.UUID,
    payload: LlmApiKeyUpdate,
    db: Session = Depends(get_db),
    _: User = Depends(require_system_admin),
):
    try:
        return update_key(db, key_id, payload)
    except LlmApiKeyError as error:
        raise _http_error(error) from error


@router.delete("/{key_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_llm_api_key(
    key_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_system_admin),
):
    try:
        delete_key(db, key_id)
    except LlmApiKeyError as error:
        raise _http_error(error) from error


@router.post("/{key_id}/make-primary", response_model=LlmApiKeyOut)
def make_llm_api_key_primary(
    key_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_system_admin),
):
    try:
        return make_primary(db, key_id)
    except LlmApiKeyError as error:
        raise _http_error(error) from error


@router.post("/{key_id}/probe", response_model=LlmApiKeyProbeOut)
def probe_llm_api_key(
    key_id: uuid.UUID,
    db: Session = Depends(get_db),
    _: User = Depends(require_system_admin),
):
    try:
        ok, key = probe_stored_key(db, key_id, probe_llm_key)
    except LlmApiKeyError as error:
        raise _http_error(error) from error
    return LlmApiKeyProbeOut(ok=ok, key=key)
