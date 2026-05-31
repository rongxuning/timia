import uuid

from sqlalchemy import String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models._mixins import TimestampMixin, UUIDPrimaryKeyMixin

SYSTEM_ROLE_ADMIN = "admin"
SYSTEM_ROLE_USER = "user"


class User(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "users"

    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")  # active/disabled
    system_role: Mapped[str] = mapped_column(
        String(20), nullable=False, default=SYSTEM_ROLE_USER
    )  # admin: 系统管理员; user: 普通账户

    workspace_memberships = relationship("WorkspaceMember", back_populates="user", cascade="all,delete-orphan")


def user_id(subject: str) -> uuid.UUID:
    return uuid.UUID(subject)

