"""device push tokens

Revision ID: 0002_device_push_tokens
Revises: 0001_notif_tables
Create Date: 2026-10-26

"""

import sqlalchemy as sa
from alembic import op

revision = "0002_device_push_tokens"
down_revision = "0001_notif_tables"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "notif_device_push_tokens",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("token", sa.String(length=200), nullable=False),
        sa.Column("platform", sa.String(length=16), nullable=False),
        sa.Column("environment", sa.String(length=16), nullable=False),
        sa.Column("invalidated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("token", name="uq_notif_device_push_tokens_token"),
    )
    op.create_index("ix_notif_device_push_tokens_user_id", "notif_device_push_tokens", ["user_id"])


def downgrade():
    op.drop_index("ix_notif_device_push_tokens_user_id", table_name="notif_device_push_tokens")
    op.drop_table("notif_device_push_tokens")
