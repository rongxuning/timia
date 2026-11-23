"""Frozen cash balance marks on stock accounts.

Revision ID: 0046_asset_stock_frozen
Revises: 0045_asset_bank_detail
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "0046_asset_stock_frozen"
down_revision = "0045_asset_bank_detail"
branch_labels = None
depends_on = None

_CURRENCIES = "'CNY', 'HKD', 'JPY', 'KRW', 'USD', 'EUR', 'GBP'"


def upgrade() -> None:
    op.create_table(
        "asset_stock_frozen",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "account_id",
            UUID(as_uuid=True),
            sa.ForeignKey("asset_accounts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("owner_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("amount_minor", sa.BigInteger(), nullable=False),
        sa.Column("reason", sa.String(length=200), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(f"currency IN ({_CURRENCIES})", name="ck_asset_stock_frozen_currency"),
        sa.CheckConstraint("char_length(reason) > 0", name="ck_asset_stock_frozen_reason"),
    )
    op.create_index("ix_asset_stock_frozen_account_time", "asset_stock_frozen", ["account_id", "recorded_at"])


def downgrade() -> None:
    op.drop_index("ix_asset_stock_frozen_account_time", table_name="asset_stock_frozen")
    op.drop_table("asset_stock_frozen")
