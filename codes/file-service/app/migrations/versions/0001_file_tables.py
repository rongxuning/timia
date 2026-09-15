"""create file tables

Revision ID: 0001_file_tables
Revises:
Create Date: 2026-09-15

"""

import sqlalchemy as sa
from alembic import op

revision = "0001_file_tables"
down_revision = None
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "files",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("workspace_id", sa.Uuid(), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("project_id", sa.Uuid(), sa.ForeignKey("projects.id"), nullable=True),
        sa.Column("folder_id", sa.Uuid(), nullable=True),
        sa.Column("created_by_user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="ready"),
        sa.Column("original_filename", sa.String(length=255), nullable=False),
        sa.Column("mime_type", sa.String(length=100), nullable=False),
        sa.Column("byte_size", sa.BigInteger(), nullable=False),
        sa.Column("width_px", sa.Integer(), nullable=True),
        sa.Column("height_px", sa.Integer(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("object_key", sa.String(length=500), nullable=False),
        sa.Column("storage_backend", sa.String(length=20), nullable=False, server_default="s3"),
        sa.Column("sha256", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint("object_key", name="uq_files_object_key"),
    )
    op.create_index(
        "idx_files_workspace_created",
        "files",
        ["workspace_id", sa.text("created_at DESC")],
        postgresql_where=sa.text("deleted_at IS NULL AND status = 'ready'"),
    )
    op.create_index(
        "idx_files_project_created",
        "files",
        ["project_id", sa.text("created_at DESC")],
        postgresql_where=sa.text("deleted_at IS NULL AND status = 'ready' AND project_id IS NOT NULL"),
    )
    op.create_index(
        "idx_files_workspace_kind",
        "files",
        ["workspace_id", "kind", sa.text("created_at DESC")],
        postgresql_where=sa.text("deleted_at IS NULL AND status = 'ready'"),
    )
    op.create_index("idx_files_filename", "files", ["workspace_id", "original_filename"])

    op.create_table(
        "file_variants",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("file_id", sa.Uuid(), sa.ForeignKey("files.id", ondelete="CASCADE"), nullable=False),
        sa.Column("variant", sa.String(length=20), nullable=False),
        sa.Column("object_key", sa.String(length=500), nullable=False),
        sa.Column("mime_type", sa.String(length=100), nullable=False),
        sa.Column("byte_size", sa.BigInteger(), nullable=False),
        sa.Column("width_px", sa.Integer(), nullable=True),
        sa.Column("height_px", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("file_id", "variant", name="uq_file_variants_file_variant"),
        sa.UniqueConstraint("object_key", name="uq_file_variants_object_key"),
    )

    op.create_table(
        "file_bindings",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("file_id", sa.Uuid(), sa.ForeignKey("files.id", ondelete="CASCADE"), nullable=False),
        sa.Column("binding_type", sa.String(length=30), nullable=False),
        sa.Column("binding_id", sa.Uuid(), nullable=False),
        sa.Column("workspace_id", sa.Uuid(), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("project_id", sa.Uuid(), sa.ForeignKey("projects.id"), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("file_id", "binding_type", "binding_id", name="uq_file_bindings_target"),
    )
    op.create_index(
        "idx_file_bindings_target",
        "file_bindings",
        ["binding_type", "binding_id", "sort_order"],
    )

    op.create_table(
        "file_activity",
        sa.Column("id", sa.Uuid(), primary_key=True),
        sa.Column("workspace_id", sa.Uuid(), sa.ForeignKey("workspaces.id"), nullable=False),
        sa.Column("actor_user_id", sa.Uuid(), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("file_id", sa.Uuid(), sa.ForeignKey("files.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action", sa.String(length=40), nullable=False),
        sa.Column("metadata", sa.JSON(), nullable=False, server_default=sa.text("'{}'")),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("idx_file_activity_workspace", "file_activity", ["workspace_id", sa.text("created_at DESC")])


def downgrade():
    op.drop_index("idx_file_activity_workspace", table_name="file_activity")
    op.drop_table("file_activity")
    op.drop_index("idx_file_bindings_target", table_name="file_bindings")
    op.drop_table("file_bindings")
    op.drop_table("file_variants")
    op.drop_index("idx_files_filename", table_name="files")
    op.drop_index("idx_files_workspace_kind", table_name="files")
    op.drop_index("idx_files_project_created", table_name="files")
    op.drop_index("idx_files_workspace_created", table_name="files")
    op.drop_table("files")
