"""Stock positions, price marks, cash, and bank transfers.

Revision ID: 0043_asset_stock_detail
Revises: 0042_asset_account_kinds
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "0043_asset_stock_detail"
down_revision = "0042_asset_account_kinds"
branch_labels = None
depends_on = None

_CURRENCIES = "'CNY', 'HKD', 'JPY', 'KRW', 'USD', 'EUR', 'GBP'"


def upgrade() -> None:
    op.create_table(
        "asset_stock_positions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("owner_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "account_id",
            UUID(as_uuid=True),
            sa.ForeignKey("asset_accounts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("symbol", sa.String(length=12), nullable=False),
        sa.Column("name", sa.String(length=80), nullable=False),
        sa.Column("market", sa.String(length=16), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("shares", sa.BigInteger(), nullable=False),
        sa.Column("cost_price_minor", sa.BigInteger(), nullable=False),
        sa.Column("market_price_minor", sa.BigInteger(), nullable=False),
        sa.Column("marked_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("market IN ('a_share', 'hk_share')", name="ck_asset_stock_positions_market"),
        sa.CheckConstraint(f"currency IN ({_CURRENCIES})", name="ck_asset_stock_positions_currency"),
        sa.CheckConstraint("shares >= 0", name="ck_asset_stock_positions_shares"),
        sa.CheckConstraint("cost_price_minor >= 0", name="ck_asset_stock_positions_cost"),
        sa.CheckConstraint("market_price_minor >= 0", name="ck_asset_stock_positions_market_price"),
    )
    op.create_index("ix_asset_stock_positions_account", "asset_stock_positions", ["account_id"])
    op.create_index(
        "uq_asset_stock_positions_symbol",
        "asset_stock_positions",
        ["account_id", "symbol"],
        unique=True,
        postgresql_where=sa.text("archived_at IS NULL"),
    )
    op.create_table(
        "asset_stock_marks",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "position_id",
            UUID(as_uuid=True),
            sa.ForeignKey("asset_stock_positions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("owner_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("shares", sa.BigInteger(), nullable=False),
        sa.Column("cost_price_minor", sa.BigInteger(), nullable=False),
        sa.Column("market_price_minor", sa.BigInteger(), nullable=False),
        sa.Column("reason", sa.String(length=200), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("shares >= 0", name="ck_asset_stock_marks_shares"),
        sa.CheckConstraint("cost_price_minor >= 0", name="ck_asset_stock_marks_cost"),
        sa.CheckConstraint("market_price_minor >= 0", name="ck_asset_stock_marks_price"),
        sa.CheckConstraint("char_length(reason) > 0", name="ck_asset_stock_marks_reason"),
    )
    op.create_index("ix_asset_stock_marks_position_time", "asset_stock_marks", ["position_id", "recorded_at"])
    op.create_table(
        "asset_stock_cash",
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
        sa.CheckConstraint(f"currency IN ({_CURRENCIES})", name="ck_asset_stock_cash_currency"),
        sa.CheckConstraint("char_length(reason) > 0", name="ck_asset_stock_cash_reason"),
    )
    op.create_index("ix_asset_stock_cash_account_time", "asset_stock_cash", ["account_id", "recorded_at"])
    op.create_table(
        "asset_stock_transfers",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "account_id",
            UUID(as_uuid=True),
            sa.ForeignKey("asset_accounts.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("owner_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("direction", sa.String(length=32), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("amount_minor", sa.BigInteger(), nullable=False),
        sa.Column("reason", sa.String(length=200), nullable=False),
        sa.Column("recorded_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint(
            "direction IN ('bank_to_securities', 'securities_to_bank')",
            name="ck_asset_stock_transfers_direction",
        ),
        sa.CheckConstraint(f"currency IN ({_CURRENCIES})", name="ck_asset_stock_transfers_currency"),
        sa.CheckConstraint("amount_minor > 0", name="ck_asset_stock_transfers_amount"),
        sa.CheckConstraint("char_length(reason) > 0", name="ck_asset_stock_transfers_reason"),
    )
    op.create_index(
        "ix_asset_stock_transfers_account_time",
        "asset_stock_transfers",
        ["account_id", "recorded_at"],
    )


def downgrade() -> None:
    op.drop_index("ix_asset_stock_transfers_account_time", table_name="asset_stock_transfers")
    op.drop_table("asset_stock_transfers")
    op.drop_index("ix_asset_stock_cash_account_time", table_name="asset_stock_cash")
    op.drop_table("asset_stock_cash")
    op.drop_index("ix_asset_stock_marks_position_time", table_name="asset_stock_marks")
    op.drop_table("asset_stock_marks")
    op.drop_index("uq_asset_stock_positions_symbol", table_name="asset_stock_positions")
    op.drop_index("ix_asset_stock_positions_account", table_name="asset_stock_positions")
    op.drop_table("asset_stock_positions")
