"""web sessions

Revision ID: 0020_web_sessions
Revises: 0019_mobile_device_sessions
Create Date: 2026-08-04

"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0020_web_sessions"
down_revision = "0019_mobile_device_sessions"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "web_sessions",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("login_provider", sa.String(length=32), nullable=False),
        sa.Column("refresh_token_hash", sa.String(length=64), nullable=False),
        sa.Column("previous_refresh_token_hash", sa.String(length=64), nullable=True),
        sa.Column("token_family_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("refresh_generation", sa.Integer(), nullable=False),
        sa.Column("last_rotation_request_id", sa.String(length=64), nullable=True),
        sa.Column("last_rotated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("idle_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("absolute_expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("revoke_reason", sa.String(length=64), nullable=True),
        sa.Column("last_ip", sa.String(length=64), nullable=True),
        sa.Column("last_user_agent", sa.String(length=512), nullable=True),
        sa.Column("user_agent_fingerprint", sa.String(length=64), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("previous_refresh_token_hash"),
        sa.UniqueConstraint("refresh_token_hash"),
    )
    op.create_index("ix_web_sessions_revoked_at", "web_sessions", ["revoked_at"])
    op.create_index("ix_web_sessions_user_id", "web_sessions", ["user_id"])


def downgrade():
    op.drop_index("ix_web_sessions_user_id", table_name="web_sessions")
    op.drop_index("ix_web_sessions_revoked_at", table_name="web_sessions")
    op.drop_table("web_sessions")
