import uuid

from sqlalchemy import CheckConstraint, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models._mixins import TimestampMixin, UUIDPrimaryKeyMixin

SYSTEM_ROLE_ADMIN = "admin"
SYSTEM_ROLE_USER = "user"


class User(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint(
            "week_starts_on IN (1, 6, 7)",
            name="ck_users_week_starts_on",
        ),
    )

    email: Mapped[str] = mapped_column(String(320), unique=True, index=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str] = mapped_column(String(120), unique=True, index=True, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")  # active/disabled
    system_role: Mapped[str] = mapped_column(
        String(20), nullable=False, default=SYSTEM_ROLE_USER
    )  # admin: 系统管理员; user: 普通账户
    # 1=Monday, 6=Saturday, 7=Sunday. Same numbering as plan week slots.
    week_starts_on: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default="1"
    )

    workspace_memberships = relationship("WorkspaceMember", back_populates="user", cascade="all,delete-orphan")


def user_id(subject: str) -> uuid.UUID:
    return uuid.UUID(subject)

