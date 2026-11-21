"""Allow a negative per-share cost on stock positions.

Revision ID: 0044_stock_negative_cost
Revises: 0043_asset_stock_detail
"""

from __future__ import annotations

from alembic import op

revision = "0044_stock_negative_cost"
down_revision = "0043_asset_stock_detail"
branch_labels = None
depends_on = None

_BOUND = "cost_price_minor BETWEEN -9007199254740991 AND 9007199254740991"


def upgrade() -> None:
    op.drop_constraint("ck_asset_stock_positions_cost", "asset_stock_positions", type_="check")
    op.create_check_constraint("ck_asset_stock_positions_cost", "asset_stock_positions", _BOUND)
    op.drop_constraint("ck_asset_stock_marks_cost", "asset_stock_marks", type_="check")
    op.create_check_constraint("ck_asset_stock_marks_cost", "asset_stock_marks", _BOUND)
    # Default tokens already carry admin:tokens. Give those the new asset scopes.
    op.execute(
        """
        UPDATE agent_tokens
        SET scopes = scopes || '["assets:read", "assets:write"]'::jsonb
        WHERE revoked_at IS NULL
          AND scopes @> '["admin:tokens"]'::jsonb
          AND NOT scopes @> '["assets:write"]'::jsonb
        """
    )


def downgrade() -> None:
    op.drop_constraint("ck_asset_stock_positions_cost", "asset_stock_positions", type_="check")
    op.create_check_constraint(
        "ck_asset_stock_positions_cost",
        "asset_stock_positions",
        "cost_price_minor >= 0",
    )
    op.drop_constraint("ck_asset_stock_marks_cost", "asset_stock_marks", type_="check")
    op.create_check_constraint(
        "ck_asset_stock_marks_cost",
        "asset_stock_marks",
        "cost_price_minor >= 0",
    )
