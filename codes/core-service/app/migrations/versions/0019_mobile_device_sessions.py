"""mobile device sessions

Revision ID: 0019_mobile_device_sessions
Revises: 0018_item_completed_at
Create Date: 2026-08-03

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0019_mobile_device_sessions"
down_revision = "0018_item_completed_at"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "auth_identities",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("provider", sa.String(length=32), nullable=False),
        sa.Column("provider_tenant", sa.String(length=255), nullable=False),
        sa.Column("provider_subject", sa.String(length=320), nullable=False),
        sa.Column("normalized_email", sa.String(length=320), nullable=True),
        sa.Column("normalized_phone", sa.String(length=32), nullable=True),
        sa.Column("email_verified", sa.Boolean(), nullable=False),
        sa.Column("phone_verified", sa.Boolean(), nullable=False),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("provider_metadata", sa.Text(), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "provider",
            "provider_tenant",
            "provider_subject",
            name="uq_auth_identity_provider_subject",
        ),
    )
    op.create_index("ix_auth_identities_user_id", "auth_identities", ["user_id"])
    op.execute(
        """
        INSERT INTO auth_identities (
            id, user_id, provider, provider_tenant, provider_subject,
            normalized_email, email_verified, phone_verified, created_at, updated_at
        )
        SELECT id, id, 'password', 'timia', lower(email),
               lower(email), true, false, created_at, updated_at
        FROM users
        """
    )

    op.create_table(
        "mobile_devices",
        sa.Column("installation_id", sa.String(length=64), nullable=False),
        sa.Column("public_key", sa.Text(), nullable=False),
        sa.Column("platform", sa.String(length=20), nullable=False),
        sa.Column("device_name", sa.String(length=160), nullable=True),
        sa.Column("os_version", sa.String(length=64), nullable=True),
        sa.Column("app_version", sa.String(length=64), nullable=True),
        sa.Column("app_attest_key_id", sa.String(length=255), nullable=True),
        sa.Column("attestation_status", sa.String(length=32), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("disabled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "ix_mobile_devices_installation_id",
        "mobile_devices",
        ["installation_id"],
        unique=True,
    )

    op.create_table(
        "mobile_sessions",
        sa.Column("user_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("device_id", postgresql.UUID(as_uuid=True), nullable=False),
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
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["device_id"], ["mobile_devices.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("previous_refresh_token_hash"),
        sa.UniqueConstraint("refresh_token_hash"),
    )
    op.create_index("ix_mobile_sessions_device_id", "mobile_sessions", ["device_id"])
    op.create_index("ix_mobile_sessions_revoked_at", "mobile_sessions", ["revoked_at"])
    op.create_index("ix_mobile_sessions_user_id", "mobile_sessions", ["user_id"])

    op.create_table(
        "auth_challenges",
        sa.Column("purpose", sa.String(length=40), nullable=False),
        sa.Column("installation_id", sa.String(length=64), nullable=False),
        sa.Column("session_id", postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column("nonce_hash", sa.String(length=64), nullable=False),
        sa.Column("attempt_count", sa.Integer(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("nonce_hash"),
    )
    op.create_index("ix_auth_challenges_expires_at", "auth_challenges", ["expires_at"])
    op.create_index(
        "ix_auth_challenges_installation_id", "auth_challenges", ["installation_id"]
    )
    op.create_index("ix_auth_challenges_purpose", "auth_challenges", ["purpose"])
    op.create_index("ix_auth_challenges_session_id", "auth_challenges", ["session_id"])


def downgrade():
    op.drop_index("ix_auth_challenges_session_id", table_name="auth_challenges")
    op.drop_index("ix_auth_challenges_purpose", table_name="auth_challenges")
    op.drop_index("ix_auth_challenges_installation_id", table_name="auth_challenges")
    op.drop_index("ix_auth_challenges_expires_at", table_name="auth_challenges")
    op.drop_table("auth_challenges")
    op.drop_index("ix_mobile_sessions_user_id", table_name="mobile_sessions")
    op.drop_index("ix_mobile_sessions_revoked_at", table_name="mobile_sessions")
    op.drop_index("ix_mobile_sessions_device_id", table_name="mobile_sessions")
    op.drop_table("mobile_sessions")
    op.drop_index("ix_mobile_devices_installation_id", table_name="mobile_devices")
    op.drop_table("mobile_devices")
    op.drop_index("ix_auth_identities_user_id", table_name="auth_identities")
    op.drop_table("auth_identities")
