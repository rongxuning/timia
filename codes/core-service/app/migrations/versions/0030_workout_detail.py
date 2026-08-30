"""workout route, elevation, and profile max heart rate

Revision ID: 0030_workout_detail
Revises: 0029_health_profile
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID

revision = "0030_workout_detail"
down_revision = "0029_health_profile"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("health_profiles", sa.Column("max_hr_bpm", sa.Integer(), nullable=True))
    op.add_column(
        "health_workout_session", sa.Column("elevation_ascended_m", sa.Float(), nullable=True)
    )
    op.add_column(
        "health_workout_session", sa.Column("elevation_descended_m", sa.Float(), nullable=True)
    )
    op.create_table(
        "health_workout_route",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "owner_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("workout_hk_uuid", UUID(as_uuid=True), nullable=False),
        sa.Column("points", JSONB(), nullable=False),
        sa.Column("point_count", sa.Integer(), nullable=False),
        sa.Column(
            "created_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.text("now()"),
            nullable=False,
        ),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("owner_user_id", "workout_hk_uuid", name="uq_health_workout_route_owner_hk"),
    )
    op.create_index(
        "ix_health_workout_route_owner_user_id", "health_workout_route", ["owner_user_id"]
    )


def downgrade() -> None:
    op.drop_index("ix_health_workout_route_owner_user_id", table_name="health_workout_route")
    op.drop_table("health_workout_route")
    op.drop_column("health_workout_session", "elevation_descended_m")
    op.drop_column("health_workout_session", "elevation_ascended_m")
    op.drop_column("health_profiles", "max_hr_bpm")
