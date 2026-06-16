# Project Item Start/End Datetime Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Items schedule-driven by required `start_at`/`end_at`, fully remove `due_at` from web + API + DB, and update the Project detail page calendar/cards accordingly.

**Architecture:** Backend removes `due_at` column and schema fields; web switches create/edit UI to required `datetime-local` Start/End and uses `start_at` for calendar grouping. Provide a one-time script to clear all items under a workspace.

**Tech Stack:** Next.js (app router) + React, FastAPI + SQLAlchemy + Alembic, Postgres.

---

## Files to touch

**Modify (web):**
- `codes/web/app/(app)/workspace/[workspaceId]/projects/[projectId]/page.tsx`
- `codes/web/app/(app)/workspace/[workspaceId]/projects/[projectId]/items/[itemId]/page.tsx` (types/display)

**Modify (api):**
- `codes/core-service/app/models/item.py`
- `codes/core-service/app/schemas/item.py`
- `codes/core-service/app/routes/items.py`
- Add Alembic migration: `codes/core-service/app/migrations/versions/0003_drop_item_due_at.py` (name may vary, but must drop `items.due_at`)

**Create (ops/script):**
- `codes/core-service/app/scripts/clear_workspace_items.py` (one-time cleanup utility)

---

### Task 1: Add backend migration to drop `due_at`

**Files:**
- Create: `codes/core-service/app/migrations/versions/0003_drop_item_due_at.py`

- [ ] **Step 1: Create alembic migration that drops the column**

```python
"""drop item due_at

Revision ID: 0003_drop_item_due_at
Revises: 0002_add_item_schedule_fields
Create Date: 2026-05-08
"""

from alembic import op

revision = "0003_drop_item_due_at"
down_revision = "0002_add_item_schedule_fields"
branch_labels = None
depends_on = None


def upgrade():
    op.drop_column("items", "due_at")


def downgrade():
    # timezone-aware to match original init schema
    import sqlalchemy as sa

    op.add_column("items", sa.Column("due_at", sa.DateTime(timezone=True), nullable=True))
```

- [ ] **Step 2: Run api migration locally**

Run (example):
- `cd codes/core-service && alembic upgrade head`

Expected: migration applies without error.

---

### Task 2: Remove `due_at` from backend model + schemas + routes

**Files:**
- Modify: `codes/core-service/app/models/item.py`
- Modify: `codes/core-service/app/schemas/item.py`
- Modify: `codes/core-service/app/routes/items.py`

- [ ] **Step 1: Update SQLAlchemy model**

Remove the `due_at` mapped column and any references.

- [ ] **Step 2: Update Pydantic schemas**

Remove `due_at` from:
- `ItemCreate`
- `ItemUpdate`
- `ItemOut`

- [ ] **Step 3: Update routes serialization**

In `list_items`, `create_item`, `get_item`, `update_item`:
- stop reading/writing `due_at`
- ensure response models match `ItemOut`

- [ ] **Step 4: Quick API smoke test**

Run:
- `cd codes/core-service && pytest -q` (if tests exist) OR `uvicorn` + create/update item through UI

Expected: endpoints still return 200/201 and include `start_at/end_at` fields.

---

### Task 3: Add one-time workspace item cleanup script

**Files:**
- Create: `codes/core-service/app/scripts/clear_workspace_items.py`

- [ ] **Step 1: Implement script**

```python
import argparse
import uuid

from sqlalchemy import delete

from app.db.session import SessionLocal
from app.models.item import Item


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--workspace-id", required=True)
    args = parser.parse_args()

    workspace_id = uuid.UUID(args.workspace_id)
    db = SessionLocal()
    try:
        res = db.execute(delete(Item).where(Item.workspace_id == workspace_id))
        db.commit()
        print(f"deleted_items={res.rowcount}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Document how to run**

Run (example):
- `cd codes/core-service && PYTHONPATH=. uv run python -m app.scripts.clear_workspace_items --workspace-id <uuid>`

Expected: prints deleted count.

---

### Task 4: Web - make Start/End required and remove Due date UI

**Files:**
- Modify: `codes/web/app/(app)/workspace/[workspaceId]/projects/[projectId]/page.tsx`

- [ ] **Step 1: Update Item type**

Change web `Item` type to include:
- `start_at?: string | null`
- `end_at?: string | null`
Remove:
- `due_at?: string | null`

- [ ] **Step 2: Update calendar grouping**

Change `tasksByDayKey` to:
- use `it.start_at`
- skip items missing `start_at`

- [ ] **Step 3: Update create modal**

Add two `datetime-local` inputs (required) and include them in POST body:
- `start_at: new Date(startLocal).toISOString()`
- `end_at: new Date(endLocal).toISOString()`

Validate:
- both present
- end >= start

- [ ] **Step 4: Update edit drawer**

Replace due date field with Start/End required:
- initialize from `drawerItem.start_at/end_at`
- save PATCH body includes `start_at/end_at`
- remove any `due_at` field from payload

- [ ] **Step 5: Fix datetime-local formatting helpers**

Implement small helpers in the page file:
- `toLocalInputValue(iso: string): string` → `YYYY-MM-DDTHH:mm` in local time
- `toIsoFromLocalInput(value: string): string` → `new Date(value).toISOString()`

---

### Task 5: Web - update task card schedule line

**Files:**
- Modify: `codes/web/app/(app)/workspace/[workspaceId]/projects/[projectId]/page.tsx`

- [ ] **Step 1: Render schedule on cards**

If both start/end exist:
- show `calendar_today` or `schedule` icon + formatted range

Formatting rule:
- same day: `MM/DD HH:mm–HH:mm`
- cross-day: `MM/DD HH:mm–MM/DD HH:mm`

---

### Task 6: Web - update Item detail page types (optional but consistent)

**Files:**
- Modify: `codes/web/app/(app)/workspace/[workspaceId]/projects/[projectId]/items/[itemId]/page.tsx`

- [ ] **Step 1: Update `Item` type**

Add `start_at/end_at` and remove `due_at` if present.

- [ ] **Step 2: (Optional) show schedule**

Render a small line under status.

---

### Task 7: Verification

**Commands:**

- [ ] **Step 1: Run web build/dev**

Run:
- `make web`

Expected: no TypeScript errors.

- [ ] **Step 2: End-to-end smoke**

In browser:
- Create a task with start/end → appears on calendar start day and card shows range
- Edit the task start/end → calendar day updates, validation works

