from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.core.security import create_access_token, hash_password, verify_password
from app.db.deps import get_db
from app.models.user import SYSTEM_ROLE_USER, User
from app.schemas.auth import LoginRequest, MeResponse, RegisterRequest, TokenResponse

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    email = str(payload.email).strip().lower()
    user = db.scalar(select(User).where(User.email == email))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="invalid_credentials")
    if user.status != "active":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="user_disabled")
    token = create_access_token(subject=str(user.id))
    return TokenResponse(access_token=token)


@router.post("/register", response_model=MeResponse, status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)):
    email = str(payload.email).strip().lower()
    display_name = payload.display_name.strip()
    if not display_name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="display_name_required")
    if len(display_name) > 120:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="display_name_too_long")
    if len(payload.password) < 8:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="password_too_short")

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
    return MeResponse(
        id=str(u.id),
        email=u.email,
        display_name=u.display_name,
        system_role=u.system_role,
    )


@router.get("/me", response_model=MeResponse)
def me(user: User = Depends(get_current_user)):
    return MeResponse(
        id=str(user.id),
        email=user.email,
        display_name=user.display_name,
        system_role=user.system_role,
    )

