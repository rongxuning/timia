"""Shared official FX rates used to convert every asset book.

Revision ID: 0041_asset_reference_rates
Revises: 0040_asset_hierarchy
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0041_asset_reference_rates"
down_revision = "0040_asset_hierarchy"
branch_labels = None
depends_on = None

_CURRENCIES = "'CNY', 'HKD', 'JPY', 'KRW', 'USD', 'EUR', 'GBP'"


def upgrade() -> None:
    op.create_table(
        "asset_reference_rates",
        sa.Column("currency", sa.String(length=3), primary_key=True),
        sa.Column("cny_per_unit", sa.Numeric(20, 8), nullable=False),
        sa.Column("as_of", sa.Date(), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("source", sa.String(length=16), nullable=False),
        sa.CheckConstraint(f"currency IN ({_CURRENCIES})", name="ck_asset_reference_rates_currency"),
        sa.CheckConstraint("currency <> 'CNY'", name="ck_asset_reference_rates_not_cny"),
        sa.CheckConstraint("cny_per_unit > 0", name="ck_asset_reference_rates_positive"),
    )


def downgrade() -> None:
    op.drop_table("asset_reference_rates")
