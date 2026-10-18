"""Personal asset ledger: profile, holdings, valuations.

Revision ID: 0038_asset_ledger
Revises: 0037_week_starts_on
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "0038_asset_ledger"
down_revision = "0037_week_starts_on"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "asset_profiles",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "owner_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("monthly_essential_minor", sa.BigInteger(), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.UniqueConstraint("owner_user_id", name="uq_asset_profiles_owner"),
        sa.CheckConstraint(
            "currency IN ('CNY', 'USD', 'HKD', 'EUR', 'GBP', 'JPY')",
            name="ck_asset_profiles_currency",
        ),
        sa.CheckConstraint(
            "monthly_essential_minor IS NULL OR monthly_essential_minor > 0",
            name="ck_asset_profiles_essential",
        ),
    )
    op.create_table(
        "asset_holdings",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "owner_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("category", sa.String(length=32), nullable=False),
        sa.Column("amount_minor", sa.BigInteger(), nullable=False),
        sa.Column("institution", sa.String(length=80), nullable=True),
        sa.Column("note", sa.String(length=500), nullable=True),
        sa.Column("as_of", sa.Date(), nullable=False),
        sa.Column("include_in_net_worth", sa.Boolean(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("kind IN ('asset', 'liability')", name="ck_asset_holdings_kind"),
        sa.CheckConstraint(
            "category IN ("
            "'cash', 'investment', 'property', 'durable', 'receivable', 'other_asset', "
            "'credit', 'installment', 'mortgage', 'payable', 'other_liability'"
            ")",
            name="ck_asset_holdings_category",
        ),
        sa.CheckConstraint("amount_minor >= 0", name="ck_asset_holdings_amount"),
    )
    op.create_index("ix_asset_holdings_owner", "asset_holdings", ["owner_user_id"])
    op.create_table(
        "asset_valuations",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "holding_id",
            UUID(as_uuid=True),
            sa.ForeignKey("asset_holdings.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "owner_user_id",
            UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("amount_minor", sa.BigInteger(), nullable=False),
        sa.Column("as_of", sa.Date(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("amount_minor >= 0", name="ck_asset_valuations_amount"),
    )
    op.create_index(
        "ix_asset_valuations_holding_as_of",
        "asset_valuations",
        ["holding_id", "as_of"],
    )


def downgrade() -> None:
    op.drop_index("ix_asset_valuations_holding_as_of", table_name="asset_valuations")
    op.drop_table("asset_valuations")
    op.drop_index("ix_asset_holdings_owner", table_name="asset_holdings")
    op.drop_table("asset_holdings")
    op.drop_table("asset_profiles")
