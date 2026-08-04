import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models._mixins import TimestampMixin, UUIDPrimaryKeyMixin, utcnow


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
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    provider: Mapped[str] = mapped_column(String(32), nullable=False)
    provider_tenant: Mapped[str] = mapped_column(String(255), nullable=False, default="timia")
    provider_subject: Mapped[str] = mapped_column(String(320), nullable=False)
    normalized_email: Mapped[str | None] = mapped_column(String(320))
    normalized_phone: Mapped[str | None] = mapped_column(String(32))
    email_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    phone_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    provider_metadata: Mapped[str | None] = mapped_column(Text)


class MobileDevice(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "mobile_devices"

    installation_id: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    public_key: Mapped[str] = mapped_column(Text, nullable=False)
    platform: Mapped[str] = mapped_column(String(20), nullable=False, default="ios")
    device_name: Mapped[str | None] = mapped_column(String(160))
    os_version: Mapped[str | None] = mapped_column(String(64))
    app_version: Mapped[str | None] = mapped_column(String(64))
    app_attest_key_id: Mapped[str | None] = mapped_column(String(255))
    attestation_status: Mapped[str] = mapped_column(String(32), nullable=False, default="not_configured")
    last_seen_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    disabled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    sessions: Mapped[list["MobileSession"]] = relationship(
        back_populates="device", cascade="all,delete-orphan"
    )


class MobileSession(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "mobile_sessions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
    )
    device_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("mobile_devices.id", ondelete="CASCADE"),
        index=True,
        nullable=False,
    )
    login_provider: Mapped[str] = mapped_column(String(32), nullable=False, default="password")
    refresh_token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    previous_refresh_token_hash: Mapped[str | None] = mapped_column(String(64), unique=True)
    token_family_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), nullable=False, default=uuid.uuid4
    )
    refresh_generation: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_rotation_request_id: Mapped[str | None] = mapped_column(String(64))
    last_rotated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_used_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False, default=utcnow
    )
    idle_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    absolute_expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    revoke_reason: Mapped[str | None] = mapped_column(String(64))
    last_ip: Mapped[str | None] = mapped_column(String(64))
    last_user_agent: Mapped[str | None] = mapped_column(String(512))

    device: Mapped[MobileDevice] = relationship(back_populates="sessions")


class AuthChallenge(Base, UUIDPrimaryKeyMixin):
    __tablename__ = "auth_challenges"

    purpose: Mapped[str] = mapped_column(String(40), index=True, nullable=False)
    installation_id: Mapped[str] = mapped_column(String(64), index=True, nullable=False)
    session_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), index=True)
    nonce_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    attempt_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True, nullable=False)
    consumed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=utcnow, nullable=False
    )
