"""Sticky note models — personal, owner-scoped, no workspace/project.

Convenience data the user jots down quickly. Private to the owner.
Optionally promoted to a real `Item` via AI parse + convert.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base
from app.models._mixins import TimestampMixin, UUIDPrimaryKeyMixin


# Status constants for AI parses
PARSE_STATUS_PENDING = "pending"
PARSE_STATUS_SUCCESS = "success"
PARSE_STATUS_FAILED = "failed"
PARSE_STATUS_SKIPPED = "skipped"

PARSE_STATUSES = frozenset(
    {PARSE_STATUS_PENDING, PARSE_STATUS_SUCCESS, PARSE_STATUS_FAILED, PARSE_STATUS_SKIPPED}
)

# Attachment type constants
ATTACHMENT_TYPE_TEXT = "text"
ATTACHMENT_TYPE_IMAGE = "image"
ATTACHMENT_TYPE_AUDIO = "audio"
ATTACHMENT_TYPE_VIDEO = "video"
ATTACHMENT_TYPE_FILE = "file"

ATTACHMENT_TYPES = frozenset(
    {
        ATTACHMENT_TYPE_TEXT,
        ATTACHMENT_TYPE_IMAGE,
        ATTACHMENT_TYPE_AUDIO,
        ATTACHMENT_TYPE_VIDEO,
        ATTACHMENT_TYPE_FILE,
    }
)

# Location source
LOCATION_SOURCE_GPS = "gps"
LOCATION_SOURCE_IP = "ip"
LOCATION_SOURCE_MANUAL = "manual"

LOCATION_SOURCES = frozenset({LOCATION_SOURCE_GPS, LOCATION_SOURCE_IP, LOCATION_SOURCE_MANUAL})


class StickyNote(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """A personal convenience note.

    Strictly private to ``owner_user_id``. No workspace, no project.
    Append-only for everything except ``title``, ``content``, and ``location_name``.
    """

    __tablename__ = "sticky_notes"

    owner_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )

    # 内容
    title: Mapped[str | None] = mapped_column(String(200), nullable=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)

    # 时间
    recorded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    timezone: Mapped[str] = mapped_column(String(64), nullable=False)

    # 地点（结构化 + 人类可读）
    location_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    location_lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    location_accuracy_m: Mapped[float | None] = mapped_column(Float, nullable=True)
    location_name: Mapped[str | None] = mapped_column(String(500), nullable=True)
    location_source: Mapped[str | None] = mapped_column(String(20), nullable=True)

    # 设备上下文
    device_kind: Mapped[str | None] = mapped_column(String(20), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)

    # 状态
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    converted_count: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, server_default="0"
    )

    # 关系
    attachments = relationship(
        "StickyNoteAttachment",
        back_populates="sticky_note",
        cascade="all,delete-orphan",
        order_by="StickyNoteAttachment.created_at",
    )
    parses = relationship(
        "StickyNoteAIParse",
        back_populates="sticky_note",
        cascade="all,delete-orphan",
        order_by="StickyNoteAIParse.created_at.desc()",
    )

    @property
    def is_archived(self) -> bool:
        return self.archived_at is not None


class StickyNoteAttachment(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """A single attachment (image/audio/video/file/text) on a sticky note.

    v1: file is stored client-side; ``storage_url`` uses a ``local://{id}/{filename}``
    placeholder. Object storage lands in v2.
    """

    __tablename__ = "sticky_note_attachments"

    sticky_note_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sticky_notes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    attachment_type: Mapped[str] = mapped_column(String(20), nullable=False)
    storage_url: Mapped[str] = mapped_column(String(2000), nullable=False)
    mime_type: Mapped[str] = mapped_column(String(100), nullable=False)
    byte_size: Mapped[int] = mapped_column(Integer, nullable=False)

    # 媒体元数据
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    width_px: Mapped[int | None] = mapped_column(Integer, nullable=True)
    height_px: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # 客户端转写（v2 启用）
    transcript: Mapped[str | None] = mapped_column(Text, nullable=True)
    ocr_text: Mapped[str | None] = mapped_column(Text, nullable=True)

    sticky_note = relationship("StickyNote", back_populates="attachments")


class StickyNoteAIParse(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    """A single AI parse attempt for a sticky note.

    At most one successful, unconverted parse exists per sticky note
    (enforced by the partial unique index ``uniq_parses_one_active_per_note``).
    """

    __tablename__ = "sticky_note_ai_parses"

    sticky_note_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("sticky_notes.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )

    parse_status: Mapped[str] = mapped_column(String(20), nullable=False)
    parse_provider: Mapped[str | None] = mapped_column(String(40), nullable=True)
    parse_latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)

    # 模型输出（成功时）
    draft_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB, nullable=True)
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    assumptions: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    missing_fields: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)
    ambiguities: Mapped[list[str] | None] = mapped_column(JSONB, nullable=True)

    # 转化结果
    converted_item_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("items.id", ondelete="SET NULL"), nullable=True
    )
    converted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # 错误
    error_code: Mapped[str | None] = mapped_column(String(40), nullable=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    sticky_note = relationship("StickyNote", back_populates="parses")
