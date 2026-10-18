"""Personal asset ledger. Private to the owner; missing or foreign ids are 404."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.deps import get_db
from app.models.user import User
from app.schemas.asset import (
    AssetHoldingArchive,
    AssetHoldingConfirm,
    AssetHoldingCreate,
    AssetHoldingOut,
    AssetHoldingUpdate,
    AssetProfileOut,
    AssetProfileUpdate,
)
from app.services.asset_api import (
    archive_holding,
    confirm_holding,
    create_holding,
    profile_out,
    update_holding,
    update_profile,
)

router = APIRouter(prefix="/asset-holdings", tags=["assets"])
profile_router = APIRouter(prefix="/asset-profile", tags=["assets"])


@profile_router.get("", response_model=AssetProfileOut)
def get_asset_profile(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return profile_out(db, user)


@profile_router.put("", response_model=AssetProfileOut)
def put_asset_profile(
    payload: AssetProfileUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return update_profile(db, user, payload)


@router.post("", response_model=AssetHoldingOut, status_code=status.HTTP_201_CREATED)
def post_asset_holding(
    payload: AssetHoldingCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return create_holding(db, user, payload)


@router.patch("/{holding_id}", response_model=AssetHoldingOut)
def patch_asset_holding(
    holding_id: uuid.UUID,
    payload: AssetHoldingUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return update_holding(db, user, holding_id, payload)


@router.post("/{holding_id}/confirm", response_model=AssetHoldingOut)
def post_confirm_asset_holding(
    holding_id: uuid.UUID,
    payload: AssetHoldingConfirm,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return confirm_holding(db, user, holding_id, payload)


@router.post("/{holding_id}/archive", status_code=status.HTTP_204_NO_CONTENT)
def post_archive_asset_holding(
    holding_id: uuid.UUID,
    payload: AssetHoldingArchive,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    archive_holding(db, user, holding_id, payload)
