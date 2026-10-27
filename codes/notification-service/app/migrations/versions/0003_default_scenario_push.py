"""turn on push for built-in notification scenarios

Revision ID: 0003_default_scenario_push
Revises: 0002_device_push_tokens
Create Date: 2026-10-27

Existing installs seeded ``push_enabled=false``. This update turns those
built-in rows on once and writes the same marker ``ensure_default_scenarios``
uses, so a later admin toggle is left alone.

"""

import sqlalchemy as sa
from alembic import op

revision = "0003_default_scenario_push"
down_revision = "0002_device_push_tokens"
branch_labels = None
depends_on = None

# Keep aligned with DEFAULT_SCENARIOS / PUSH_BACKFILL_KEY in app.services.scenarios.
SCENARIO_KEYS = (
    "task_self_join",
    "task_member_added",
    "workspace_member_added",
    "project_member_added",
    "task_created_in_project",
    "task_commented",
)
PUSH_BACKFILL_KEY = "__default_push_backfill_v1"


def upgrade():
    keys = ", ".join(f"'{key}'" for key in SCENARIO_KEYS)
    op.execute(
        sa.text(
            f"""
            UPDATE notif_scenarios
            SET push_enabled = true,
                updated_at = CURRENT_TIMESTAMP
            WHERE push_enabled = false
              AND key IN ({keys})
            """
        )
    )
    op.execute(
        sa.text(
            f"""
            INSERT INTO notif_scenarios (
                key, enabled, title_template, body_template, push_enabled, updated_at
            )
            SELECT '{PUSH_BACKFILL_KEY}', false, '', '', true, CURRENT_TIMESTAMP
            WHERE NOT EXISTS (
                SELECT 1 FROM notif_scenarios WHERE key = '{PUSH_BACKFILL_KEY}'
            )
            """
        )
    )


def downgrade():
    op.execute(sa.text(f"DELETE FROM notif_scenarios WHERE key = '{PUSH_BACKFILL_KEY}'"))
    keys = ", ".join(f"'{key}'" for key in SCENARIO_KEYS)
    op.execute(
        sa.text(
            f"""
            UPDATE notif_scenarios
            SET push_enabled = false,
                updated_at = CURRENT_TIMESTAMP
            WHERE key IN ({keys})
            """
        )
    )
