## Goal

On the Project detail page (`/workspace/[workspaceId]/projects/[projectId]`), tasks (Items) support **required** Start/End datetime so the project calendar and task cards are schedule-driven.

## Scope

- Affects Project detail page task creation + edit drawer UI (`codes/web/app/(app)/workspace/[workspaceId]/projects/[projectId]/page.tsx`).
- Uses existing backend fields: `start_at`, `end_at` (already in DB/model/schema).
- **Remove `due_at` from web + API + DB** (fully schedule-driven by `start_at`/`end_at`).
- Calendar displays tasks **only** based on `start_at` (date part). No fallback to `due_at`.
- Old tasks without start/end are considered out-of-scope for compatibility and can be **cleared**.

## UX / Interaction

### Task create (modal)

- Add two inputs:
  - **Start**: `datetime-local` (minute precision)
  - **End**: `datetime-local` (minute precision)
- Both are **required**.
- Validation:
  - Start must be present
  - End must be present
  - `end_at` must be \(\ge\) `start_at`
- On submit, send:
  - `start_at`, `end_at`
  - no `due_at`

### Task edit (drawer)

- Replace the existing `Due date` field with:
  - **Start** (required)
  - **End** (required)
- Same validation rules as create.
- Save payload must include:
  - `start_at`, `end_at`
  - no `due_at`

### Task card (kanban columns)

- Show a compact schedule line (clock icon + range), e.g.:
  - `05/08 10:00–12:00`
  - Cross-day: `05/08 23:00–05/09 01:00`
- If data is missing (should not happen after cleanup), omit the schedule line.

### Calendar (project page)

- Group tasks by `start_at` date (local date).
- Tasks without `start_at` are **not shown**.
- Clicking a task opens the existing edit drawer.

## Data / API Contract

### Client-side Item shape (web)

- `start_at: string | null` (ISO datetime from API)
- `end_at: string | null` (ISO datetime from API)
- `due_at` is removed from all web types/state.

### Backend contract (api)

- `ItemCreate`, `ItemUpdate`, `ItemOut` remove `due_at`.
- `Item` model drops `due_at` column.
- Items list/get/create/update responses do not include `due_at`.

### Time parsing / serialization

- UI uses `datetime-local` which returns `YYYY-MM-DDTHH:mm` (no timezone).
- Client converts to ISO string before sending:
  - `new Date(localDateTimeString).toISOString()`
- When populating inputs from API ISO datetimes, convert to a `datetime-local` value in local time:
  - `new Date(iso).toISOString().slice(0, 16)` is **not** correct for local display (it shows UTC); instead format to local `YYYY-MM-DDTHH:mm`.

## Old Data Cleanup (non-compatible by design)

- Expectation: existing Items that only have `due_at` (or missing schedule fields) will be cleared.
- Recommended approach:
  - One-time script or admin SQL to delete **all `items` under the entire workspace** (all projects), OR
  - Bulk update to set `start_at/end_at` for remaining items (not required by this spec).

### DB migration

- Add a new migration to drop `items.due_at`.

## Non-goals

- No compatibility fallback to `due_at` in calendar or cards.
- No recurring events, duration visualization, drag-to-reschedule, or timezone settings UI.
- No other backend schema changes beyond dropping `due_at`.

## Test Plan

- Create task:
  - Start/End required; invalid range blocked with error
  - Task appears on kanban card with schedule line
  - Task appears on calendar day matching Start date
- Edit task:
  - Changing Start date moves it to the new calendar day
  - End earlier than Start shows validation error
- Old data:
  - After cleanup, no tasks lacking Start appear on calendar

