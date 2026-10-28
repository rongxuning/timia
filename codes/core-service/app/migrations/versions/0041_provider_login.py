"""Nullable password, merge pointer, phone-code challenges.

Revision ID: 0041_provider_login
Revises: 0040_asset_hierarchy
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0041_provider_login"
down_revision = "0040_asset_hierarchy"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("users", "email", existing_type=sa.String(length=320), nullable=True)
    op.alter_column(
        "users", "password_hash", existing_type=sa.String(length=255), nullable=True
    )
    op.add_column(
        "users",
        sa.Column("merged_into_user_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_users_merged_into_user_id",
        "users",
        "users",
        ["merged_into_user_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index(
        "ix_users_merged_into_user_id", "users", ["merged_into_user_id"]
    )
    op.add_column("auth_challenges", sa.Column("subject", sa.String(length=320), nullable=True))
    op.add_column("auth_challenges", sa.Column("code_hash", sa.String(length=64), nullable=True))
    op.create_index(
        "ix_auth_challenges_purpose_subject",
        "auth_challenges",
        ["purpose", "subject"],
    )


def downgrade() -> None:
    op.drop_index("ix_auth_challenges_purpose_subject", table_name="auth_challenges")
    op.drop_column("auth_challenges", "code_hash")
    op.drop_column("auth_challenges", "subject")
    op.drop_index("ix_users_merged_into_user_id", table_name="users")
    op.drop_constraint("fk_users_merged_into_user_id", "users", type_="foreignkey")
    op.drop_column("users", "merged_into_user_id")
    op.execute(
        "UPDATE users SET email = id::text || '@merged.timia.invalid' WHERE email IS NULL"
    )
    op.execute("UPDATE users SET password_hash = '' WHERE password_hash IS NULL")
    op.alter_column("users", "password_hash", existing_type=sa.String(length=255), nullable=False)
    op.alter_column("users", "email", existing_type=sa.String(length=320), nullable=False)
