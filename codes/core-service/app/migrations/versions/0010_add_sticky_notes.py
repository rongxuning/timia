"""add sticky notes tables

Revision ID: 0010_add_sticky_notes
Revises: 0009_ws_creator_owner
Create Date: 2026-08-05

"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB, UUID


revision = "0010_add_sticky_notes"
down_revision = "0009_ws_creator_owner"
branch_labels = None
depends_on = None


def upgrade():
    # 1) sticky_notes
    op.create_table(
        "sticky_notes",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("owner_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("timezone", sa.String(length=64), nullable=False),
        sa.Column("location_lat", sa.Double(), nullable=True),
        sa.Column("location_lng", sa.Double(), nullable=True),
        sa.Column("location_accuracy_m", sa.Float(), nullable=True),
        sa.Column("location_name", sa.String(length=500), nullable=True),
        sa.Column("location_source", sa.String(length=20), nullable=True),
        sa.Column("device_kind", sa.String(length=20), nullable=True),
        sa.Column("user_agent", sa.String(length=500), nullable=True),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("converted_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index(
        "idx_sticky_notes_owner_recorded",
        "sticky_notes",
        ["owner_user_id", sa.text("recorded_at DESC")],
        postgresql_where=sa.text("archived_at IS NULL"),
    )
    op.create_index(
        "idx_sticky_notes_owner_archived",
        "sticky_notes",
        ["owner_user_id", sa.text("archived_at DESC")],
        postgresql_where=sa.text("archived_at IS NOT NULL"),
    )

    # 2) sticky_note_attachments
    op.create_table(
        "sticky_note_attachments",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "sticky_note_id",
            UUID(as_uuid=True),
            sa.ForeignKey("sticky_notes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("attachment_type", sa.String(length=20), nullable=False),
        sa.Column("storage_url", sa.String(length=2000), nullable=False),
        sa.Column("mime_type", sa.String(length=100), nullable=False),
        sa.Column("byte_size", sa.BigInteger(), nullable=False),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("width_px", sa.Integer(), nullable=True),
        sa.Column("height_px", sa.Integer(), nullable=True),
        sa.Column("transcript", sa.Text(), nullable=True),
        sa.Column("ocr_text", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index(
        "idx_attachments_sticky_note",
        "sticky_note_attachments",
        ["sticky_note_id", "created_at"],
    )

    # 3) sticky_note_ai_parses
    op.create_table(
        "sticky_note_ai_parses",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "sticky_note_id",
            UUID(as_uuid=True),
            sa.ForeignKey("sticky_notes.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("parse_status", sa.String(length=20), nullable=False),
        sa.Column("parse_provider", sa.String(length=40), nullable=True),
        sa.Column("parse_latency_ms", sa.Integer(), nullable=True),
        sa.Column("draft_json", JSONB, nullable=True),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("assumptions", JSONB, nullable=True),
        sa.Column("missing_fields", JSONB, nullable=True),
        sa.Column("ambiguities", JSONB, nullable=True),
        sa.Column(
            "converted_item_id",
            UUID(as_uuid=True),
            sa.ForeignKey("items.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("converted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("error_code", sa.String(length=40), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index(
        "idx_parses_sticky_note",
        "sticky_note_ai_parses",
        ["sticky_note_id", sa.text("created_at DESC")],
    )
    op.create_index(
        "uniq_parses_one_active_per_note",
        "sticky_note_ai_parses",
        ["sticky_note_id"],
        unique=True,
        postgresql_where=sa.text("parse_status = 'success' AND converted_item_id IS NULL"),
    )


def downgrade():
    op.drop_index("uniq_parses_one_active_per_note", table_name="sticky_note_ai_parses")
    op.drop_index("idx_parses_sticky_note", table_name="sticky_note_ai_parses")
    op.drop_table("sticky_note_ai_parses")
    op.drop_index("idx_attachments_sticky_note", table_name="sticky_note_attachments")
    op.drop_table("sticky_note_attachments")
    op.drop_index("idx_sticky_notes_owner_archived", table_name="sticky_notes")
    op.drop_index("idx_sticky_notes_owner_recorded", table_name="sticky_notes")
    op.drop_table("sticky_notes")
