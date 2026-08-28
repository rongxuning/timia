"""add health metrics layout and widen workout activity raw

Revision ID: 0027_health_layout_activity
Revises: 0026_add_health_domain
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "0027_health_layout_activity"
down_revision = "0026_add_health_domain"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "health_metrics_layout",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "owner_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("card_order", JSONB, nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            nullable=False,
            server_default=sa.text("now()"),
        ),
        sa.UniqueConstraint("owner_user_id", name="uq_health_metrics_layout_owner"),
    )
    op.create_index(
        "ix_health_metrics_layout_owner_user_id",
        "health_metrics_layout",
        ["owner_user_id"],
    )
    op.alter_column(
        "health_workout_session",
        "activity_type_raw",
        existing_type=sa.String(length=64),
        type_=sa.String(length=80),
        existing_nullable=True,
    )


def downgrade() -> None:
    op.alter_column(
        "health_workout_session",
        "activity_type_raw",
        existing_type=sa.String(length=80),
        type_=sa.String(length=64),
        existing_nullable=True,
    )
    op.drop_index("ix_health_metrics_layout_owner_user_id", table_name="health_metrics_layout")
    op.drop_table("health_metrics_layout")
