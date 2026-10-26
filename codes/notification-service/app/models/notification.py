import uuid
from datetime import datetime

from sqlalchemy import JSON, Boolean, DateTime, ForeignKey, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models._mixins import TimestampMixin, UUIDPrimaryKeyMixin, utcnow


class NotificationScenario(Base):
    __tablename__ = "notif_scenarios"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    title_template: Mapped[str] = mapped_column(Text, nullable=False)
    body_template: Mapped[str] = mapped_column(Text, nullable=False)
    push_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow, nullable=False)


class Notification(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "notif_notifications"

    title: Mapped[str] = mapped_column(Text, nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")
    sender_user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    link: Mapped[str | None] = mapped_column(String(500), nullable=True)
    audience_type: Mapped[str] = mapped_column(String(32), nullable=False)
    audience_params: Mapped[dict] = mapped_column(JSON, nullable=False)
    timing: Mapped[str] = mapped_column(String(20), nullable=False, default="immediate")
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    scenario_key: Mapped[str | None] = mapped_column(String(64), nullable=True)


class NotificationDelivery(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "notif_deliveries"
    __table_args__ = (
        UniqueConstraint("notification_id", "user_id", name="uq_notif_deliveries_notification_user"),
    )

    notification_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("notif_notifications.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    push_status: Mapped[str] = mapped_column(String(20), nullable=False, default="skipped")


class DevicePushToken(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """APNs device token bound to a user. Invalid tokens stay for audit until re-registered."""

    __tablename__ = "notif_device_push_tokens"
    __table_args__ = (UniqueConstraint("token", name="uq_notif_device_push_tokens_token"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True
    )
    token: Mapped[str] = mapped_column(String(200), nullable=False)
    platform: Mapped[str] = mapped_column(String(16), nullable=False, default="apns")
    environment: Mapped[str] = mapped_column(String(16), nullable=False)
    invalidated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
