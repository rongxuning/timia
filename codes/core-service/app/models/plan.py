import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    UniqueConstraint,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models._mixins import TimestampMixin, UUIDPrimaryKeyMixin


class PlanTemplate(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "plan_templates"

    created_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[str | None] = mapped_column(String(10000), nullable=True)
    creator_intro: Mapped[str | None] = mapped_column(String(10000), nullable=True)
    usage_kind: Mapped[str] = mapped_column(String(20), nullable=False)
    period_kind: Mapped[str] = mapped_column(String(20), nullable=False)
    visibility: Mapped[str] = mapped_column(String(20), nullable=False)
    use_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )
    version: Mapped[int] = mapped_column(
        Integer, nullable=False, default=1, server_default="1"
    )


class PlanSlot(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "plan_slots"

    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("plan_templates.id", ondelete="CASCADE"),
        nullable=False,
    )
    rel_month: Mapped[int | None] = mapped_column(Integer, nullable=True)
    rel_day: Mapped[int] = mapped_column(Integer, nullable=False)
    start_minute: Mapped[int] = mapped_column(Integer, nullable=False)
    end_minute: Mapped[int] = mapped_column(Integer, nullable=False)
    all_day: Mapped[bool] = mapped_column(
        Boolean, nullable=False, default=False, server_default=text("false")
    )
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str | None] = mapped_column(String(10000), nullable=True)
    details: Mapped[str | None] = mapped_column(String(10000), nullable=True)
    color: Mapped[str] = mapped_column(
        String(7), nullable=False, default="#FFFFFF", server_default="#FFFFFF"
    )
    priority: Mapped[str] = mapped_column(
        String(10), nullable=False, default="1", server_default="1"
    )
    location: Mapped[str | None] = mapped_column(String(500), nullable=True)
    sort_index: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )


class PlanTag(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "plan_tags"

    name: Mapped[str] = mapped_column(String(20), nullable=False, unique=True)


class PlanTemplateTag(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "plan_template_tags"
    __table_args__ = (UniqueConstraint("template_id", "tag_id", name="uq_plan_template_tag"),)

    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("plan_templates.id", ondelete="CASCADE"),
        nullable=False,
    )
    tag_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("plan_tags.id", ondelete="CASCADE"),
        nullable=False,
    )


class PlanSubscription(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "plan_subscriptions"
    __table_args__ = (
        UniqueConstraint(
            "template_id",
            "subscriber_user_id",
            "project_id",
            name="uq_plan_subscription_template_user_project",
        ),
    )

    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("plan_templates.id", ondelete="CASCADE"),
        nullable=False,
    )
    subscriber_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id"), nullable=False
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False
    )
    timezone: Mapped[str] = mapped_column(
        String(100),
        nullable=False,
        default="Asia/Shanghai",
        server_default="Asia/Shanghai",
    )


class PlanSubscriptionSegment(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "plan_subscription_segments"
    __table_args__ = (
        Index(
            "uq_plan_subscription_one_open_segment",
            "subscription_id",
            unique=True,
            postgresql_where=text("ended_at IS NULL"),
        ),
    )

    subscription_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("plan_subscriptions.id", ondelete="CASCADE"),
        nullable=False,
    )
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class PlanApplyRun(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "plan_apply_runs"
    __table_args__ = (
        Index(
            "uq_plan_apply_plan_mode_applied",
            "actor_user_id",
            "template_id",
            "project_id",
            "period_start",
            unique=True,
            postgresql_where=text("source = 'plan_mode' AND status = 'applied'"),
        ),
        Index(
            "uq_plan_apply_sub_applied",
            "subscription_id",
            "period_start",
            unique=True,
            postgresql_where=text("subscription_id IS NOT NULL AND status = 'applied'"),
        ),
        Index(
            "uq_plan_apply_sub_pending",
            "subscription_id",
            "period_start",
            unique=True,
            postgresql_where=text("subscription_id IS NOT NULL AND status = 'pending'"),
        ),
    )

    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("plan_templates.id", ondelete="CASCADE"),
        nullable=False,
    )
    template_version: Mapped[int] = mapped_column(Integer, nullable=False)
    actor_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    workspace_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("workspaces.id"), nullable=False
    )
    project_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("projects.id"), nullable=False
    )
    source: Mapped[str] = mapped_column(String(20), nullable=False)
    subscription_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("plan_subscriptions.id", ondelete="SET NULL"),
        nullable=True,
    )
    segment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("plan_subscription_segments.id", ondelete="SET NULL"),
        nullable=True,
    )
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_kind: Mapped[str] = mapped_column(String(20), nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False)
    skipped_slots: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, nullable=False, default=list, server_default=text("'[]'::jsonb")
    )
    applied_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class PlanComment(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "plan_comments"

    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("plan_templates.id", ondelete="CASCADE"),
        nullable=False,
    )
    author_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    body: Mapped[str] = mapped_column(String(10000), nullable=False)
    parent_comment_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("plan_comments.id", ondelete="SET NULL"),
        nullable=True,
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), nullable=True
    )


class PlanFavorite(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "plan_favorites"
    __table_args__ = (UniqueConstraint("user_id", "template_id", name="uq_plan_favorite"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    template_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("plan_templates.id", ondelete="CASCADE"),
        nullable=False,
    )


class PlanNotification(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "plan_notifications"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    kind: Mapped[str] = mapped_column(String(40), nullable=False)
    template_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("plan_templates.id", ondelete="SET NULL"),
        nullable=True,
    )
    subscription_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("plan_subscriptions.id", ondelete="SET NULL"),
        nullable=True,
    )
    apply_run_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("plan_apply_runs.id", ondelete="SET NULL"),
        nullable=True,
    )
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    meta: Mapped[dict[str, Any]] = mapped_column(
        JSONB, nullable=False, default=dict, server_default=text("'{}'::jsonb")
    )
