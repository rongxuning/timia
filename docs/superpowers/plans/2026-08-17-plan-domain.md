# Plan Domain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the Web「规划」menu: independent `plan_*` templates, one-shot import of a single period window, and subscriptions that import the current period then prompt before later periods.

**Architecture:** Templates and relative slots live only in `plan_*` tables. Confirming apply/subscribe is the sole path that inserts `Item` rows (with nullable `source_plan_*` FKs). Pure time helpers in `plan_time.py` map slots and reminder windows; write services in `plan_api.py` / `plan_apply.py`; list/detail aggregates in `services/views/plans.py`. Hourly host cron runs `python -m app.jobs.plan_reminders`.

**Tech Stack:** FastAPI + SQLAlchemy 2 + Alembic + Pydantic v2; Next.js App Router + Tailwind; existing `PinnedTagSelect`; host cron (no Celery).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-17-plan-domain-design.md`
- Table names all `plan_*`; no `paid` field or UI
- `usage_kind` is `one_shot` | `subscription`; `period_kind` is `day` | `week` | `month` | `year`; both immutable after create
- `visibility` is `private` | `public` only
- Templates never store `item_id`; items are created only inside apply-run materialization
- Generated items: `repeat="none"`, `status="todo"`, `assignee_user_id` = actor, `created_by_user_id` = actor
- Week starts Sunday (same as `_sunday_week_start` in `schedule_layout.py`)
- Slot limits: day 20, week 50, month 80, year 100; same-day slots only
- FastAPI: register `/views/plans/imported` and `/subscribed` **before** `/{plan_id}`
- After OpenAPI change: `make codegen` from repo root
- Core-service: Ruff line width 100; `uv run pytest`; `uv run ruff check .`
- No `.ts` extensions in production Web imports
- Do not change iOS
- Do not commit unless the user asked for a commit in this session

---

## File map

| File | Role |
|------|------|
| `codes/core-service/app/services/plan_time.py` | Period anchors, slot → datetime, reminder window |
| `codes/core-service/tests/test_plan_time.py` | Unit tests for time helpers |
| `codes/core-service/app/models/plan.py` | All `plan_*` ORM models |
| `codes/core-service/app/models/item.py` | Nullable `source_plan_*` FKs |
| `codes/core-service/app/models/__init__.py` | Export plan models |
| `codes/core-service/app/migrations/versions/0023_plan_domain.py` | Tables + item columns |
| `codes/core-service/app/schemas/plan.py` | Write DTOs |
| `codes/core-service/app/schemas/views/plans.py` | View DTOs |
| `codes/core-service/app/services/plan_api.py` | Template CRUD, slots, tags, comments, visibility |
| `codes/core-service/app/services/plan_apply.py` | Apply, subscribe, confirm/skip/cancel, materialize items |
| `codes/core-service/app/routes/plans.py` | Write routes |
| `codes/core-service/app/routes/views/plans.py` | Read views |
| `codes/core-service/app/services/views/plans.py` | List/detail/imported/subscribed/notifications |
| `codes/core-service/app/jobs/plan_reminders.py` | Hourly reminder + expire |
| `codes/core-service/tests/test_plan_api.py` | API tests (auth, kind mismatch, apply, subscribe) |
| `codes/core-service/app/main.py` | Include routers |
| `codes/core-service/app/migrations/env.py` | Import plan models |
| `codes/core-service/app/routes/dev_db_tables.py` | Include plan models in dev listing |
| `deploy/local.sh` | Install hourly plan-reminders cron |
| `codes/web/src/lib/api/plans.ts` | Client |
| `codes/web/src/types/api/views/plans.ts` | View types if not fully generated |
| `codes/web/src/components/plans/*` | UI |
| `codes/web/app/(app)/plans/**` | Pages |
| `codes/web/src/components/layout/SideNav.tsx` | 规划 nav item + badge |
| `codes/web/src/components/layout/NavItem.tsx` | Optional badge |
| `codes/web/src/lib/api-catalog.ts` | Document new endpoints |
| `codes/web/src/types/api/generated.ts` | Regenerated |

---

### Task 1: Period and slot time helpers

**Files:**
- Create: `codes/core-service/app/services/plan_time.py`
- Create: `codes/core-service/tests/test_plan_time.py`

**Interfaces:**
- Consumes: `datetime.date`, `zoneinfo.ZoneInfo`
- Produces:
  - `SLOT_LIMITS: dict[str, int]` = `{"day": 20, "week": 50, "month": 80, "year": 100}`
  - `sunday_week_start(d: date) -> date`
  - `current_period_start(period_kind: str, now: datetime, timezone_name: str) -> date`
  - `next_period_start(period_kind: str, period_start: date) -> date`
  - `period_end_date(period_kind: str, period_start: date) -> date`
  - `resolve_slot_bounds(*, period_kind: str, period_start: date, rel_month: int | None, rel_day: int, start_minute: int, end_minute: int, all_day: bool, timezone_name: str) -> tuple[datetime, datetime] | None`
  - `in_reminder_window(period_start: date, now: datetime, timezone_name: str) -> bool`
  - `pending_should_expire(period_kind: str, period_start: date, now: datetime, timezone_name: str) -> bool`
  - `upcoming_period_start(period_kind: str, now: datetime, timezone_name: str, existing_period_starts: set[date]) -> date | None`

- [ ] **Step 1: Write failing tests**

```python
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from app.services.plan_time import (
    current_period_start,
    in_reminder_window,
    next_period_start,
    pending_should_expire,
    period_end_date,
    resolve_slot_bounds,
    sunday_week_start,
    upcoming_period_start,
)

SH = "Asia/Shanghai"


def test_sunday_week_start_from_wednesday():
    # 2026-08-19 is Wednesday; week starts 2026-08-16 (Sunday)
    assert sunday_week_start(date(2026, 8, 19)) == date(2026, 8, 16)


def test_current_period_start_week_and_month():
    now = datetime(2026, 8, 19, 15, 0, tzinfo=ZoneInfo(SH))
    assert current_period_start("day", now, SH) == date(2026, 8, 19)
    assert current_period_start("week", now, SH) == date(2026, 8, 16)
    assert current_period_start("month", now, SH) == date(2026, 8, 1)
    assert current_period_start("year", now, SH) == date(2026, 1, 1)


def test_week_slot_maps_monday_morning():
    # rel_day 1 = Monday of week starting Sunday 2026-08-16 → 2026-08-17 09:00-10:00 CST
    start, end = resolve_slot_bounds(
        period_kind="week",
        period_start=date(2026, 8, 16),
        rel_month=None,
        rel_day=1,
        start_minute=9 * 60,
        end_minute=10 * 60,
        all_day=False,
        timezone_name=SH,
    )
    assert start.isoformat() == "2026-08-17T09:00:00+08:00"
    assert end.isoformat() == "2026-08-17T10:00:00+08:00"


def test_month_slot_skips_february_31():
    assert (
        resolve_slot_bounds(
            period_kind="month",
            period_start=date(2026, 2, 1),
            rel_month=None,
            rel_day=31,
            start_minute=0,
            end_minute=60,
            all_day=False,
            timezone_name=SH,
        )
        is None
    )


def test_reminder_window_is_previous_local_day_from_20():
    period_start = date(2026, 8, 23)  # next Sunday
    before = datetime(2026, 8, 22, 19, 59, tzinfo=ZoneInfo(SH))
    at = datetime(2026, 8, 22, 20, 0, tzinfo=ZoneInfo(SH))
    assert in_reminder_window(period_start, before, SH) is False
    assert in_reminder_window(period_start, at, SH) is True


def test_pending_expires_after_period_end():
    assert pending_should_expire(
        "week",
        date(2026, 8, 16),
        datetime(2026, 8, 23, 0, 1, tzinfo=ZoneInfo(SH)),
        SH,
    )
    assert not pending_should_expire(
        "week",
        date(2026, 8, 16),
        datetime(2026, 8, 22, 23, 0, tzinfo=ZoneInfo(SH)),
        SH,
    )


def test_upcoming_skips_period_starts_that_already_have_runs():
    now = datetime(2026, 8, 19, 15, 0, tzinfo=ZoneInfo(SH))
    # current week 2026-08-16 already applied; next is 2026-08-23
    d = upcoming_period_start("week", now, SH, {date(2026, 8, 16)})
    assert d == date(2026, 8, 23)
    # if next week already skipped/applied, walk to 2026-08-30
    d2 = upcoming_period_start("week", now, SH, {date(2026, 8, 16), date(2026, 8, 23)})
    assert d2 == date(2026, 8, 30)
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd codes/core-service && uv run pytest tests/test_plan_time.py -q`

Expected: FAIL with `ModuleNotFoundError: No module named 'app.services.plan_time'`

- [ ] **Step 3: Implement `plan_time.py`**

```python
from __future__ import annotations

from calendar import monthrange
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

SLOT_LIMITS = {"day": 20, "week": 50, "month": 80, "year": 100}


def resolve_timezone(timezone_name: str) -> ZoneInfo:
    try:
        return ZoneInfo(timezone_name)
    except (ZoneInfoNotFoundError, ValueError) as error:
        raise ValueError("invalid timezone") from error


def sunday_week_start(d: date) -> date:
    return d - timedelta(days=(d.weekday() + 1) % 7)


def current_period_start(period_kind: str, now: datetime, timezone_name: str) -> date:
    local = now.astimezone(resolve_timezone(timezone_name)).date()
    if period_kind == "day":
        return local
    if period_kind == "week":
        return sunday_week_start(local)
    if period_kind == "month":
        return date(local.year, local.month, 1)
    if period_kind == "year":
        return date(local.year, 1, 1)
    raise ValueError("invalid period_kind")


def next_period_start(period_kind: str, period_start: date) -> date:
    if period_kind == "day":
        return period_start + timedelta(days=1)
    if period_kind == "week":
        return period_start + timedelta(days=7)
    if period_kind == "month":
        y, m = period_start.year, period_start.month + 1
        if m == 13:
            y, m = y + 1, 1
        return date(y, m, 1)
    if period_kind == "year":
        return date(period_start.year + 1, 1, 1)
    raise ValueError("invalid period_kind")


def period_end_date(period_kind: str, period_start: date) -> date:
    return next_period_start(period_kind, period_start) - timedelta(days=1)


def resolve_slot_bounds(
    *,
    period_kind: str,
    period_start: date,
    rel_month: int | None,
    rel_day: int,
    start_minute: int,
    end_minute: int,
    all_day: bool,
    timezone_name: str,
) -> tuple[datetime, datetime] | None:
    tz = resolve_timezone(timezone_name)
    if period_kind == "day":
        day = period_start
    elif period_kind == "week":
        if rel_day < 0 or rel_day > 6:
            return None
        day = period_start + timedelta(days=rel_day)
    elif period_kind == "month":
        last = monthrange(period_start.year, period_start.month)[1]
        if rel_day < 1 or rel_day > last:
            return None
        day = date(period_start.year, period_start.month, rel_day)
    elif period_kind == "year":
        if rel_month is None or rel_month < 1 or rel_month > 12:
            return None
        last = monthrange(period_start.year, rel_month)[1]
        if rel_day < 1 or rel_day > last:
            return None
        day = date(period_start.year, rel_month, rel_day)
    else:
        raise ValueError("invalid period_kind")

    if all_day:
        start = datetime.combine(day, time.min, tzinfo=tz)
        end = datetime.combine(day + timedelta(days=1), time.min, tzinfo=tz)
        return start, end
    if not (0 <= start_minute < end_minute <= 1440):
        return None
    start = datetime.combine(day, time.min, tzinfo=tz) + timedelta(minutes=start_minute)
    end = datetime.combine(day, time.min, tzinfo=tz) + timedelta(minutes=end_minute)
    return start, end


def in_reminder_window(period_start: date, now: datetime, timezone_name: str) -> bool:
    local = now.astimezone(resolve_timezone(timezone_name))
    return local.date() == period_start - timedelta(days=1) and local.hour >= 20


def pending_should_expire(
    period_kind: str, period_start: date, now: datetime, timezone_name: str
) -> bool:
    local = now.astimezone(resolve_timezone(timezone_name)).date()
    return local > period_end_date(period_kind, period_start)


def upcoming_period_start(
    period_kind: str,
    now: datetime,
    timezone_name: str,
    existing_period_starts: set[date],
) -> date:
    candidate = next_period_start(
        period_kind, current_period_start(period_kind, now, timezone_name)
    )
    while candidate in existing_period_starts:
        candidate = next_period_start(period_kind, candidate)
    return candidate
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd codes/core-service && uv run pytest tests/test_plan_time.py -q`

Expected: PASS

- [ ] **Step 5: Commit only if the user asked**

---

### Task 2: Models and migration

**Files:**
- Create: `codes/core-service/app/models/plan.py`
- Create: `codes/core-service/app/migrations/versions/0023_plan_domain.py`
- Modify: `codes/core-service/app/models/item.py` (add three nullable FKs)
- Modify: `codes/core-service/app/models/__init__.py`
- Modify: `codes/core-service/app/migrations/env.py` (import plan models)
- Modify: `codes/core-service/app/routes/dev_db_tables.py` (include plan models in the import list)

**Interfaces:**
- Consumes: `UUIDPrimaryKeyMixin`, `TimestampMixin`, `Item`
- Produces: `PlanTemplate`, `PlanSlot`, `PlanTag`, `PlanTemplateTag`, `PlanSubscription`, `PlanSubscriptionSegment`, `PlanApplyRun`, `PlanComment`, `PlanNotification`; `Item.source_plan_template_id`, `Item.source_plan_slot_id`, `Item.source_plan_apply_run_id`

- [ ] **Step 1: Add models**

`PlanTemplate` fields: `created_by_user_id` FK users, `title` String(200), `description` String(10000) nullable, `creator_intro` String(10000) nullable, `usage_kind` String(20), `period_kind` String(20), `visibility` String(20), `use_count` Integer default 0, `version` Integer default 1.

`PlanSlot`: `template_id` FK `plan_templates.id` ON DELETE CASCADE, `rel_month` Integer nullable, `rel_day` Integer not null, `start_minute` Integer, `end_minute` Integer, `all_day` Boolean default false, `title` String(200), `body`/`details` String(10000) nullable, `color` String(7) default `#FFFFFF`, `priority` String(10) default `"1"`, `location` String(500) nullable, `sort_index` Integer default 0.

`PlanTag`: `name` String(20) unique.

`PlanTemplateTag`: `template_id`, `tag_id`, unique pair, both CASCADE.

`PlanSubscription`: `template_id`, `subscriber_user_id`, `workspace_id`, `project_id`, `timezone` String(100) default `Asia/Shanghai`; unique `(template_id, subscriber_user_id, project_id)`.

`PlanSubscriptionSegment`: `subscription_id` CASCADE, `started_at` DateTime tz, `ended_at` DateTime tz nullable. Partial unique index: one row per `subscription_id` where `ended_at IS NULL`.

`PlanApplyRun`: columns from spec. `period_start` use `Date` (not DateTime). `skipped_slots` JSONB default `[]`. `status` String(20). `source` String(20). FKs nullable for subscription/segment. Partial unique indexes:

```python
Index(
    "uq_plan_apply_one_shot_applied",
    "actor_user_id",
    "template_id",
    "project_id",
    "period_start",
    unique=True,
    postgresql_where=text("source = 'one_shot' AND status = 'applied'"),
)
Index(
    "uq_plan_apply_sub_applied",
    "subscription_id",
    "period_start",
    unique=True,
    postgresql_where=text("subscription_id IS NOT NULL AND status = 'applied'"),
)
Index(
    "uq_plan_apply_sub_pending",
    "subscription_id",
    "period_start",
    unique=True,
    postgresql_where=text("subscription_id IS NOT NULL AND status = 'pending'"),
)
```

`PlanComment`: `template_id` CASCADE, `author_user_id`, `body` String(10000), `parent_comment_id` self-FK SET NULL, `deleted_at` nullable.

`PlanNotification`: `user_id`, `kind` String(40), nullable FKs `template_id`/`subscription_id`/`apply_run_id`, `read_at` nullable, `meta` JSONB default `{}`.

On `Item` add three UUID columns FK to plan tables `ON DELETE SET NULL`.

Revision: `revision = "0023_plan_domain"`, `down_revision = "0022_sticky_updated_at"`.

- [ ] **Step 2: Run migration locally**

Run: `cd codes/core-service && uv run alembic upgrade head`

Expected: upgrade succeeds; `\d plan_templates` exists in psql (or `uv run python -c` inspect).

- [ ] **Step 3: Commit only if the user asked**

---

### Task 3: Template CRUD, slots, tags

**Files:**
- Create: `codes/core-service/app/schemas/plan.py`
- Create: `codes/core-service/app/services/plan_api.py`
- Create: `codes/core-service/app/routes/plans.py`
- Modify: `codes/core-service/app/main.py` (`include_router(plans_router)`)
- Create: `codes/core-service/tests/test_plan_api.py` (extend in later tasks)

**Interfaces:**
- Consumes: `PlanTemplate`, `PlanSlot`, `PlanTag`, `require_plan_visible(db, template, user)`, `SLOT_LIMITS`
- Produces:
  - `PlanTemplateCreate(title, description, creator_intro, usage_kind, period_kind, visibility, tags: list[str])`
  - `PlanTemplateUpdate` PATCH fields except usage_kind/period_kind
  - `PlanSlotPut(rel_month, rel_day, start_minute, end_minute, all_day, title, body, details, color, priority, location, sort_index)`
  - `PUT /plan-templates/{id}/slots` body: `list[PlanSlotPut]`
  - Routes: `POST/PATCH/DELETE /plan-templates`, `PUT /plan-templates/{id}/slots`
  - Errors: `not_found`, `forbidden`, `invalid_usage_kind`, `invalid_period_kind`, `invalid_visibility`, `too_many_slots`, `too_many_tags`, `tag_too_long`, `invalid_slot`

- [ ] **Step 1: Write failing API tests for create + slot replace + private hide**

Use the existing `TestClient` fixture pattern from `tests/test_web_auth.py` / item tests if a logged-in client fixture exists. If tests need DB, follow `tests/conftest.py`. Minimum cases:

```python
def test_create_plan_template_returns_201(auth_client):
    r = auth_client.post("/plan-templates", json={
        "title": "晨间",
        "description": "d",
        "creator_intro": "作者介绍",
        "usage_kind": "one_shot",
        "period_kind": "week",
        "visibility": "private",
        "tags": ["专注"],
    })
    assert r.status_code == 201
    body = r.json()
    assert body["usage_kind"] == "one_shot"
    assert body["creator_intro"] == "作者介绍"
    assert body["tags"] == ["专注"]


def test_put_slots_rejects_over_week_limit(auth_client, week_template_id):
    slots = [
        {
            "rel_month": None,
            "rel_day": 0,
            "start_minute": i,
            "end_minute": i + 1,
            "all_day": False,
            "title": str(i),
            "body": None,
            "details": None,
            "color": "#FFFFFF",
            "priority": "1",
            "location": None,
            "sort_index": i,
        }
        for i in range(51)
    ]
    r = auth_client.put(f"/plan-templates/{week_template_id}/slots", json=slots)
    assert r.status_code == 400
    assert r.json()["detail"] == "too_many_slots"


def test_other_user_cannot_get_private_template(other_auth_client, private_id):
    r = other_auth_client.get(f"/views/plans/{private_id}")
    assert r.status_code == 404
```

(The GET view test can wait until Task 5 if `/views/plans/{id}` is not registered yet; in that case assert `PATCH` by another user returns 404/`forbidden`.)

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd codes/core-service && uv run pytest tests/test_plan_api.py -q`

Expected: FAIL (missing routes)

- [ ] **Step 3: Implement**

`require_plan_owner`: 404 if missing or not creator (do not leak private ids).

Tag normalize: `strip()`, reject empty, max 20 chars → `tag_too_long`; max 8 tags → `too_many_tags`; get-or-create `PlanTag` by name.

`replace_slots`: delete existing slots for template, insert payload order; bump `template.version`; if template has active subscription segments, insert `PlanNotification(kind="template_updated")` for each subscriber (can land in Task 6 if notifications table is enough — do it here once models exist).

PATCH cannot accept `usage_kind` or `period_kind`. Bump `version` when title/description/creator_intro/slots change.

DELETE: creator only; end open segments (`ended_at=now`); set pending runs to `canceled`; SET NULL happens via FK on items; then delete template (slots cascade).

Router: `APIRouter(prefix="/plan-templates", tags=["plan-templates"])`.

- [ ] **Step 4: Run tests**

Run: `cd codes/core-service && uv run pytest tests/test_plan_api.py -q`

Expected: PASS for cases implemented in this task

- [ ] **Step 5: Commit only if the user asked**

---

### Task 4: Apply one-shot (materialize items)

**Files:**
- Create: `codes/core-service/app/services/plan_apply.py`
- Modify: `codes/core-service/app/routes/plans.py` (`POST /plan-templates/{id}/apply`)
- Modify: `codes/core-service/app/schemas/plan.py` (`PlanApplyRequest`, `PlanApplyRunOut`)
- Modify: `codes/core-service/tests/test_plan_api.py`

**Interfaces:**
- Consumes: `require_project_content_access`, `resolve_slot_bounds`, `PlanApplyRun`, `Item`
- Produces:
  - `apply_one_shot(db, user, template_id, workspace_id, project_id, period_start: date) -> PlanApplyRun`
  - `materialize_run(db, run: PlanApplyRun) -> PlanApplyRun` (shared with subscribe)
  - Errors: `wrong_usage_kind`, `empty_template`, `already_applied`, `not_found`, `invalid timezone` as `invalid_timezone`

- [ ] **Step 1: Write failing tests**

```python
def test_apply_subscription_template_rejected(auth_client, subscription_template_id, workspace_id, project_id):
    r = auth_client.post(
        f"/plan-templates/{subscription_template_id}/apply",
        json={
            "workspace_id": workspace_id,
            "project_id": project_id,
            "period_start": "2026-08-16",
        },
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "wrong_usage_kind"


def test_apply_week_creates_items_on_chosen_week(auth_client, week_one_shot_id, workspace_id, project_id):
    r = auth_client.post(
        f"/plan-templates/{week_one_shot_id}/apply",
        json={
            "workspace_id": workspace_id,
            "project_id": project_id,
            "period_start": "2026-08-16",
        },
    )
    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "applied"
    assert body["item_count"] >= 1
    again = auth_client.post(
        f"/plan-templates/{week_one_shot_id}/apply",
        json={
            "workspace_id": workspace_id,
            "project_id": project_id,
            "period_start": "2026-08-16",
        },
    )
    assert again.status_code == 409
    assert again.json()["detail"] == "already_applied"
```

Empty slots → `400 empty_template`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd codes/core-service && uv run pytest tests/test_plan_api.py::test_apply_subscription_template_rejected tests/test_plan_api.py::test_apply_week_creates_items_on_chosen_week -q`

Expected: FAIL (404 or missing attribute)

- [ ] **Step 3: Implement `materialize_run`**

For each slot, `bounds = resolve_slot_bounds(...)`. If `None`, append `{slot_id, reason: "invalid_day"}` to `skipped_slots`. Else `Item(...)` with source FKs set, `repeat` omitted (column does not exist on Item; repeat is request-only). `use_count += 1` once per successful applied run (even if some slots skipped, as long as at least one item OR still count? Spec: successful apply run +1. Count even if all skipped? Prefer +1 only when `item_count > 0`; if all skipped still `applied` with empty items — then `400 empty_template` before create if every slot invalid and no items would be created).

`log_activity(..., entity_type="plan_apply_run", action="apply_plan", metadata={"template_id": str(template.id), "item_count": n, "period_start": period_start.isoformat()})`.

Normalize `period_start`: if client sends a Wednesday for a week template, coerce with `sunday_week_start(period_start)` so the stored anchor is always canonical.

- [ ] **Step 4: Run tests**

Run: `cd codes/core-service && uv run pytest tests/test_plan_api.py -q`

Expected: PASS including apply cases

- [ ] **Step 5: Commit only if the user asked**

---

### Task 5: Subscribe, cancel, confirm, skip

**Files:**
- Modify: `codes/core-service/app/services/plan_apply.py`
- Modify: `codes/core-service/app/routes/plans.py`
- Modify: `codes/core-service/tests/test_plan_api.py`

**Interfaces:**
- Produces:
  - `subscribe_plan(db, user, template_id, workspace_id, project_id, timezone: str) -> PlanSubscribeOut` (includes `imported_current_period: bool`, `apply_run`)
  - `cancel_subscription(db, user, subscription_id) -> None`
  - `confirm_apply_run(db, user, run_id) -> PlanApplyRun`
  - `skip_apply_run(db, user, run_id) -> PlanApplyRun`
  - Errors: `wrong_usage_kind`, `already_subscribed`, `not_found`, `run_not_pending`

- [ ] **Step 1: Write failing tests**

```python
def test_subscribe_imports_current_week(auth_client, sub_template_id, workspace_id, project_id, monkeypatch):
    # freeze now to 2026-08-19 15:00 Asia/Shanghai inside subscribe via dependency or pass-through clock
    r = auth_client.post(
        f"/plan-templates/{sub_template_id}/subscribe",
        json={
            "workspace_id": workspace_id,
            "project_id": project_id,
            "timezone": "Asia/Shanghai",
        },
    )
    assert r.status_code == 201
    assert r.json()["imported_current_period"] is True
    assert r.json()["apply_run"]["period_start"] == "2026-08-16"


def test_resubscribe_same_week_does_not_duplicate_items(
    auth_client, sub_template_id, workspace_id, project_id, subscription_id
):
    auth_client.post(f"/plan-subscriptions/{subscription_id}/cancel")
    r = auth_client.post(
        f"/plan-templates/{sub_template_id}/subscribe",
        json={
            "workspace_id": workspace_id,
            "project_id": project_id,
            "timezone": "Asia/Shanghai",
        },
    )
    assert r.status_code == 201
    assert r.json()["imported_current_period"] is False


def test_apply_one_shot_on_subscription_template_still_rejected(auth_client, sub_template_id, workspace_id, project_id):
    r = auth_client.post(
        f"/plan-templates/{sub_template_id}/apply",
        json={
            "workspace_id": workspace_id,
            "project_id": project_id,
            "period_start": "2026-08-16",
        },
    )
    assert r.json()["detail"] == "wrong_usage_kind"
```

For confirm/skip: insert a `pending` run in the test setup (or call an internal helper), then POST confirm and assert items exist; POST skip and assert `skipped` and no new items.

If freezing time is hard, inject `now: datetime | None = None` on `subscribe_plan` and a test-only query is unnecessary — use real `datetime.now` and assert `period_start == current_period_start("week", now, tz).isoformat()`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd codes/core-service && uv run pytest tests/test_plan_api.py -k subscribe -q`

Expected: FAIL

- [ ] **Step 3: Implement**

Subscribe: `wrong_usage_kind` if not `subscription`. Reuse subscription row on unique key. If open segment exists → `409 already_subscribed`. Insert segment. Compute `period_start = current_period_start(...)`. If no `applied` run for `(subscription_id, period_start)`, `materialize_run` with `source="subscription"` immediately. Else `imported_current_period=False`.

Cancel: owner of subscription only; `ended_at=utcnow()`; all `pending` for that subscription → `canceled`.

Confirm: run must be `pending` and actor (or subscriber) matches; materialize at **current** template version; set `template_version` from template at confirm time. If `run.template_version` differs from template.version, still apply new slots (spec: confirm uses current slots) and include `template_updated: true` on the response.

Skip: `pending` → `skipped`, `applied_at=None`.

- [ ] **Step 4: Run tests**

Run: `cd codes/core-service && uv run pytest tests/test_plan_api.py -q`

Expected: PASS

- [ ] **Step 5: Commit only if the user asked**

---

### Task 6: View APIs

**Files:**
- Create: `codes/core-service/app/schemas/views/plans.py`
- Create: `codes/core-service/app/services/views/plans.py`
- Create: `codes/core-service/app/routes/views/plans.py`
- Modify: `codes/core-service/app/main.py`
- Modify: `codes/core-service/tests/test_plan_api.py`

**Interfaces:**
- Produces:
  - `GET /views/plans?tab=&q=&visibility=&creator_q=&tag=&period_kind=&usage_kind=&limit=&offset=`
  - `GET /views/plans/imported`
  - `GET /views/plans/subscribed`
  - `GET /views/plans/{plan_id}`
  - `GET /views/plan-notifications`
  - `POST /plan-notifications/{id}/read` (write router in `routes/plans.py`)
  - Card: `id, title, usage_kind, period_kind, visibility, creator, tags, use_count`
  - Detail adds: `description, creator_intro, slots, my_import_count, my_subscription, pending_run`
  - Imported row: template card + `my_import_count` + `runs[{period_start, applied_at, items[{id,title,deleted}]]`
  - Subscribed row: subscription id, project/workspace names, `segments[{started_at,ended_at,runs,items}]`, `pending_run`

**Route order:** declare `/imported` and `/subscribed` before `/{plan_id}`.

Discover tab: force `visibility=public` in the service even if query says private.

- [ ] **Step 1: Write failing tests**

```python
def test_discover_hides_private(auth_client, other_auth_client, private_one_shot_id):
    r = other_auth_client.get("/views/plans", params={"tab": "discover"})
    assert r.status_code == 200
    ids = [row["id"] for row in r.json()["items"]]
    assert private_one_shot_id not in ids


def test_imported_lists_apply_count_and_items(auth_client, week_one_shot_id, workspace_id, project_id):
    auth_client.post(
        f"/plan-templates/{week_one_shot_id}/apply",
        json={
            "workspace_id": workspace_id,
            "project_id": project_id,
            "period_start": "2026-08-16",
        },
    )
    r = auth_client.get("/views/plans/imported")
    assert r.status_code == 200
    row = next(x for x in r.json()["items"] if x["id"] == week_one_shot_id)
    assert row["my_import_count"] == 1
    assert row["runs"][0]["period_start"] == "2026-08-16"
    assert len(row["runs"][0]["items"]) >= 1


def test_subscribed_shows_open_segment(auth_client, sub_template_id, workspace_id, project_id):
    auth_client.post(
        f"/plan-templates/{sub_template_id}/subscribe",
        json={
            "workspace_id": workspace_id,
            "project_id": project_id,
            "timezone": "Asia/Shanghai",
        },
    )
    r = auth_client.get("/views/plans/subscribed")
    assert r.status_code == 200
    row = r.json()["items"][0]
    assert row["segments"][0]["ended_at"] is None
```

- [ ] **Step 2: Run to fail**

Run: `cd codes/core-service && uv run pytest tests/test_plan_api.py::test_discover_hides_private tests/test_plan_api.py::test_imported_lists_apply_count_and_items tests/test_plan_api.py::test_subscribed_shows_open_segment -q`

Expected: FAIL (missing view routes)

- [ ] **Step 3: Implement view builders** (no SQL in routes; `try/except ValueError` → HTTP). Pagination `limit` default 20, max 50.

- [ ] **Step 4: Run tests + ruff**

Run: `cd codes/core-service && uv run pytest tests/test_plan_api.py tests/test_plan_time.py -q && uv run ruff check .`

Expected: PASS / ruff clean

- [ ] **Step 5: Commit only if the user asked**

---

### Task 7: Template comments

**Files:**
- Modify: `codes/core-service/app/routes/plans.py`
- Modify: `codes/core-service/app/services/plan_api.py`
- Modify: `codes/core-service/tests/test_plan_api.py`

**Interfaces:**
- `GET/POST /plan-templates/{id}/comments`
- `PATCH/DELETE /plan-templates/{id}/comments/{comment_id}`
- POST may set `parent_comment_id`
- On reply, notify parent author with `kind=comment_reply` if different user
- Soft-delete sets `deleted_at`; GET omits body or returns `"已删除"` matching item comments style — use `deleted_at` and hide body like workspace comments

- [ ] **Step 1–4:** Failing test (public template, second user comments 201; private 404) → implement → pytest pass

- [ ] **Step 5: Commit only if the user asked**

---

### Task 8: Reminder job and host cron

**Files:**
- Create: `codes/core-service/app/jobs/__init__.py` (empty)
- Create: `codes/core-service/app/jobs/plan_reminders.py`
- Create: `codes/core-service/tests/test_plan_reminders.py`
- Modify: `deploy/local.sh` (install a second cron file)

**Interfaces:**
- `run_plan_reminders(db: Session, now: datetime | None = None) -> dict` with `pending_created` and `expired` counts
- `__main__` opens `SessionLocal`, calls `run_plan_reminders`, commits

- [ ] **Step 1: Write failing unit tests** that construct simple namespaces or use DB fixtures:

Logic to implement inside `run_plan_reminders`:

```python
for segment in open_segments:  # ended_at is None
    sub = segment.subscription
    existing = {run.period_start for run in runs_for(sub.id)}
    d = upcoming_period_start(sub.template.period_kind, now, sub.timezone, existing)
    if in_reminder_window(d, now, sub.timezone):
        # insert pending + PlanNotification(kind="upcoming_period")
        ...
    for run in pending_runs(sub.id):
        if pending_should_expire(sub.template.period_kind, run.period_start, now, sub.timezone):
            run.status = "expired"
```

Test `in_reminder_window` integration: given now Saturday 20:00 SH and existing `{current Sunday}`, creates pending for next Sunday.

- [ ] **Step 2: Run to fail**

Run: `cd codes/core-service && uv run pytest tests/test_plan_reminders.py -q`

Expected: FAIL

- [ ] **Step 3: Implement job + cron**

`deploy/local.sh`: in `cmd_install_cron`, also write `/etc/cron.d/timia-plan-reminders`:

```
0 * * * * root cd /opt/timia && TIMIA_ENV_FILE=/opt/timia/.env.prod bash /opt/timia/deploy/dc.sh exec -T core-service python -m app.jobs.plan_reminders >> /var/log/timia-plan-reminders.log 2>&1
```

Adjust env file path to match `timia_resolve_env_file` used elsewhere in `local.sh`. Do not use Celery or the commented `notification-service`.

- [ ] **Step 4: Run tests**

Run: `cd codes/core-service && uv run pytest tests/test_plan_reminders.py tests/test_plan_time.py -q`

Expected: PASS

- [ ] **Step 5: Commit only if the user asked**

---

### Task 9: Web API client, codegen, catalog

**Files:**
- Modify: `codes/core-service/openapi.json` via export
- Modify: `codes/web/src/types/api/generated.ts` via `make codegen`
- Create: `codes/web/src/lib/api/plans.ts`
- Create: `codes/web/src/types/api/views/plans.ts` (if generated types are incomplete for views)
- Modify: `codes/web/src/lib/api-catalog.ts`

**Interfaces:**
- `fetchPlanList`, `fetchPlanDetail`, `fetchImportedPlans`, `fetchSubscribedPlans`, `fetchPlanNotifications`
- `createPlanTemplate`, `updatePlanTemplate`, `deletePlanTemplate`, `putPlanSlots`
- `applyPlan`, `subscribePlan`, `cancelPlanSubscription`, `confirmPlanApplyRun`, `skipPlanApplyRun`
- `listPlanComments`, `addPlanComment`
- `markPlanNotificationRead`

- [ ] **Step 1: Export OpenAPI and codegen**

Run: `make codegen` from repo root

Expected: `generated.ts` contains `/plan-templates` and `/views/plans`

- [ ] **Step 2: Add `plans.ts` wrappers using `apiFetch` + token, matching `schedule-views.ts` style**

- [ ] **Step 3: Add catalog entries** (name in Chinese: 规划列表、规划详情、加入规划、订阅规划、… )

- [ ] **Step 4: Commit only if the user asked**

---

### Task 10: Web shell + list page

**Files:**
- Modify: `codes/web/src/components/layout/NavItem.tsx` — add optional `badge?: number`
- Modify: `codes/web/src/components/layout/SideNav.tsx` — item after 我的日程, `href="/plans"`, `icon="calendar_month"`, `label="规划"`
- Create: `codes/web/app/(app)/plans/page.tsx`
- Create: `codes/web/src/components/plans/PlanList.tsx`
- Create: `codes/web/src/components/plans/PlanCard.tsx`
- Create: `codes/web/src/components/plans/PlanFilters.tsx`

**Interfaces:**
- Tabs: `discover | created | imported | subscribed` as query `?tab=`
- Filters: `q`, `creator_q`, `period_kind`, `usage_kind`, tags; visibility only on `created`
- Card shows title, 加入/订阅, 日/周/月/年, 私有/公开, creator display_name, tags, `use_count`
- Discover never sends `visibility=private`

Badge on SideNav: fetch `/views/plan-notifications` unread count + pending (if cheap: notifications list length where `read_at` is null). Hide badge when 0.

- [ ] **Step 1: Add nav + empty list page that loads discover**

Copy layout patterns from `codes/web/app/(app)/workspaces/page.tsx` (`PageMain`, token, error state).

- [ ] **Step 2: Manual check** — 规划 appears between 我的日程 and 工作空间; `/plans` loads.

- [ ] **Step 3: Commit only if the user asked**

---

### Task 11: Create, edit, detail, slot editor

**Files:**
- Create: `codes/web/app/(app)/plans/new/page.tsx`
- Create: `codes/web/app/(app)/plans/[id]/page.tsx`
- Create: `codes/web/app/(app)/plans/[id]/edit/page.tsx`
- Create: `codes/web/src/components/plans/PlanEditorForm.tsx`
- Create: `codes/web/src/components/plans/PlanSlotEditor.tsx`
- Create: `codes/web/src/components/plans/PlanRelativeCalendar.tsx`

**Interfaces:**
- New: first screen/fields `usage_kind` + `period_kind` (required, disabled on edit)
- Fields: title, description, creator_intro, visibility, tags (chip input, max 8)
- `PlanSlotEditor`: relative grid (day = 24h column; week = 7 columns Sun–Sat; month = 31 cells; year = 12 months). Click empty cell → popover with title + start/end (or all-day). Do **not** call schedule calendar APIs and do **not** write `items`. Save slots with `putPlanSlots`.
- Detail: description, creator_intro, tags, use_count, relative preview (read-only editor), comments thread, owner edit link
- Join button only if `usage_kind === "one_shot"`; subscribe/cancel only if `subscription`

- [ ] **Step 1: Implement new/edit/detail wired to APIs**

- [ ] **Step 2: Manual check** — create a private week one-shot with two slots; reopen edit; slots persist.

- [ ] **Step 3: Commit only if the user asked**

---

### Task 12: Apply / subscribe dialogs and library tabs

**Files:**
- Create: `codes/web/src/components/plans/PlanApplyDialog.tsx`
- Create: `codes/web/src/components/plans/PlanSubscribeDialog.tsx`
- Create: `codes/web/src/components/plans/PlanImportedPanel.tsx`
- Create: `codes/web/src/components/plans/PlanSubscribedPanel.tsx`
- Modify: `codes/web/app/(app)/plans/page.tsx`
- Modify: `codes/web/src/components/plans/PlanDetailActions` (or detail page)

**Interfaces:**
- Apply dialog: `PinnedTagSelect` workspace then project; period picker:
  - day: `<input type="date">`
  - week: week picker that submits **Sunday** `period_start` (reuse `sundayWeekStart` from `codes/web/src/components/schedule/calendarNav.ts`)
  - month: year-month
  - year: year
  Preview copy: `将导入 N 个任务（{range}）`
- Subscribe dialog: workspace, project, timezone default `Asia/Shanghai`; copy: `将导入本周期 {range} 的 N 个任务`
- Imported tab: `fetchImportedPlans` — count + run list + task links to `/workspace/{wid}/projects/{pid}/items/{iid}`
- Subscribed tab: segments timeline (`started_at`–`ended_at` or 至今), tasks per segment, pending card 确认/跳过, 取消订阅
- After confirm/skip, refresh list and nav badge

- [ ] **Step 1: Implement dialogs + tabs**

- [ ] **Step 2: Manual check**
  - Week one-shot: must pick a week; applying twice same week shows already_applied error
  - Subscription: subscribe mid-week imports current week into 我的日程
  - Cancel then subscribe again: new segment; current week not duplicated
  - Pending card on Saturday after 20:00 (or invoke `python -m app.jobs.plan_reminders` with frozen now in a test) shows 确认/跳过

- [ ] **Step 3: Commit only if the user asked**

---

## Spec coverage

| Spec section | Task |
|--------------|------|
| §1 routes/tabs/nav | 10–12 |
| §2 relative slots + skip invalid days | 1, 4, 11 |
| §3 tables | 2 |
| §4 one-shot apply | 4, 12 |
| §5.1 subscribe current period | 5, 12 |
| §5.2 cron reminder 20:00 previous day | 1, 8, 12 |
| §5.3 template update notify | 3 |
| §5.4 delete template | 3 |
| §6 permissions | 3–7 |
| §7 APIs | 3–7, 9 |
| §8 Web | 10–12 |
| §9 tests | 1, 3–8 |
| §10 out of scope | Global constraints |

## Placeholder / type check

- Names locked: `current_period_start`, `upcoming_period_start`, `in_reminder_window`, `materialize_run`, `apply_one_shot`, `subscribe_plan`
- Status literals: `pending|applied|skipped|expired|canceled`
- No `paid`, no Celery, no iOS
