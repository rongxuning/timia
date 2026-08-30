"""add health profile for sex age height

Revision ID: 0029_health_profile
Revises: 0028_workout_card_metrics
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "0029_health_profile"
down_revision = "0028_workout_card_metrics"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "health_profiles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "owner_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("sex", sa.String(length=16), nullable=True),
        sa.Column("age_years", sa.Integer(), nullable=True),
        sa.Column("height_cm", sa.Float(), nullable=True),
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
        sa.UniqueConstraint("owner_user_id", name="uq_health_profiles_owner"),
    )
    op.create_index("ix_health_profiles_owner_user_id", "health_profiles", ["owner_user_id"])


def downgrade() -> None:
    op.drop_index("ix_health_profiles_owner_user_id", table_name="health_profiles")
    op.drop_table("health_profiles")
