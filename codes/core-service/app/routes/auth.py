from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.security import hash_password
from app.db.deps import get_db
from app.models.user import SYSTEM_ROLE_USER, User
from app.schemas.auth import MeResponse, MeUpdate, RegisterRequest
from app.services.week_calendar import WEEK_START_DAYS

router = APIRouter(prefix="/auth", tags=["auth"])


def _me_response(user: User) -> MeResponse:
    return MeResponse(
        id=str(user.id),
        email=user.email,
        display_name=user.display_name,
        system_role=user.system_role,
        week_starts_on=user.week_starts_on,
    )


@router.post("/register", response_model=MeResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    email = str(payload.email).strip().lower()
    display_name = payload.display_name.strip()
    if not display_name:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="display_name_required"
        )
    if len(display_name) > 120:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="display_name_too_long"
        )
    if len(payload.password) < 8:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="password_too_short"
        )

    existing_email = db.scalar(select(User).where(User.email == email))
    if existing_email:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="email_taken")

    existing_name = db.scalar(select(User).where(User.display_name == display_name))
    if existing_name:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="display_name_taken")

    u = User(
        email=email,
        display_name=display_name,
        password_hash=hash_password(payload.password),
        status="active",
        system_role=SYSTEM_ROLE_USER,
    )
    db.add(u)
    db.commit()
    return _me_response(u)


@router.get("/me", response_model=MeResponse)
def me(user: User = Depends(get_current_user)):
    return _me_response(user)


@router.patch("/me", response_model=MeResponse)
def update_me(
    payload: MeUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if "week_starts_on" in payload.model_fields_set:
        if payload.week_starts_on not in WEEK_START_DAYS:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST, detail="invalid_week_start"
            )
        user.week_starts_on = payload.week_starts_on
        db.commit()
        db.refresh(user)
    return _me_response(user)
