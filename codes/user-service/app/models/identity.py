"""Shared-database mappings for users, WeChat identities, and web sessions.

Schema changes stay in core-service migrations. This service reads and writes
the same tables. It does not create them.
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models._mixins import TimestampMixin, UUIDPrimaryKeyMixin, utcnow


class User(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "users"

    email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    display_name: Mapped[str] = mapped_column(String(120), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active")
    merged_into_user_id: Mapped[uuid.UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    system_role: Mapped[str] = mapped_column(String(20), nullable=False, default="user")
    week_starts_on: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class AuthIdentity(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "auth_identities"
    __table_args__ = (
        UniqueConstraint(
            "provider",
            "provider_tenant",
            "provider_subject",
            name="uq_auth_identity_provider_subject",
        ),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    provider_tenant: Mapped[str] = mapped_column(String(255), nullable=False)
    provider_subject: Mapped[str] = mapped_column(String(320), nullable=False)
    normalized_email: Mapped[str | None] = mapped_column(String(320))
    normalized_phone: Mapped[str | None] = mapped_column(String(32))
    email_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    phone_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    provider_metadata: Mapped[str | None] = mapped_column(Text)


class WebSession(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "web_sessions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    login_provider: Mapped[str] = mapped_column(String(32), nullable=False, default="password")
    refresh_token_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    previous_refresh_token_hash: Mapped[str | None] = mapped_column(String(64))
    token_family_id: Mapped[uuid.UUID] = mapped_column(Uuid(as_uuid=True), nullable=False)
    refresh_generation: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_rotation_request_id: Mapped[str | None] = mapped_column(String(64))
    last_rotated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_used_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    idle_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    absolute_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoke_reason: Mapped[str | None] = mapped_column(String(64))
    last_ip: Mapped[str | None] = mapped_column(String(64))
    last_user_agent: Mapped[str | None] = mapped_column(String(512))
    user_agent_fingerprint: Mapped[str | None] = mapped_column(String(64))
