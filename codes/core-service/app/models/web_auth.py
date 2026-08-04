"""Web session model — mirrors MobileSession but without a device keypair.

Browser identity is captured via a soft fingerprint (user-agent + IP). Strong
binding comes from the HttpOnly + Secure + SameSite refresh-token cookie, which
JS cannot read.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models._mixins import TimestampMixin, UUIDPrimaryKeyMixin, utcnow


class WebSession(Base, UUIDPrimaryKeyMixin, TimestampMixin):
    __tablename__ = "web_sessions"

    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), index=True, nullable=False
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
    # Soft fingerprint — informational only, not enforced. The cookie is the
    # real binding. IP/UA rotation (mobile, VPN) is normal and should not
    # invalidate sessions.
    last_ip: Mapped[str | None] = mapped_column(String(64))
    last_user_agent: Mapped[str | None] = mapped_column(String(512))
    user_agent_fingerprint: Mapped[str | None] = mapped_column(String(64))
