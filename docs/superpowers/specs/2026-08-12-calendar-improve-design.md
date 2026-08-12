# Calendar Improve Design

**Date:** 2026-08-12  
**Branch:** `feature/improve-calendar`  
**Scope:** Web calendar sticky headers + year heatmap; Web + iOS calendar task title strikethrough for completed/archived  
**Out of scope:** Priority quadrants / swimlane strikethrough; iOS year mode; continuous multi-month scroll

## Goal

1. Show strikethrough on calendar task titles when status is `done` or `archived` (Web + iOS calendar cards only).
2. Expand Web sticky freeze so mode-switcher toolbar stays visible while scrolling in day/week; add sticky for month; keep single-month grid.
3. Add Web year mode as a task-count heatmap using the existing backend year calendar API; clicking a day opens day view.

## Decisions (confirmed)

| Topic | Choice |
|-------|--------|
| Month sticky / scroll | **A** — single-month grid; sticky toolbar + weekday row only; arrows still change month |
| Strikethrough statuses | `done` **and** `archived` |
| Strikethrough surfaces | Calendar task cards only (not quadrants / swimlane) |
| Year day click | Switch to **day** view for that date |
| Approach | Reorganize sticky shell + reuse `view=year` API |

## §1 Title strikethrough (Web + iOS)

### Rules

- Apply when `status === "done" || status === "archived"`.
- Affect **title text only** (not workspace/project, time, or body lines).
- Visual: strikethrough + slight opacity reduction (Web: `line-through` + muted opacity; iOS: `.strikethrough()` + reduced opacity).

### Web

- Implement in `CalendarTaskCardLines` (shared by month bars, all-day, timeline cards via `CalendarTaskCard`).
- Do **not** change `PriorityQuadrants` or `SwimlaneKanban` card titles.

### iOS

- Apply on calendar-mode task title renderers (day / week / month calendar cards in Schedule features).
- Do **not** change priority / swimlane list cards unless they share the same calendar-only view path (prefer calendar-specific call sites).

### Unchanged

- Completion toggle behavior, PATCH APIs, tooltips content (may still show full title).

---

## §2 Web sticky header freeze

### Problem today

- Day/week: sticky wraps date / weekday / all-day only; mode switcher lives outside sticky in `ScheduleCalendar`.
- Month: no sticky; weekday labels sit above `ScheduleCalendarMonth`.
- Section uses `overflow-clip`, which prevents sticky from working against page scroll.

### Scroll container

Page main scroll (not an inner overflow panel), unless product shell already uses a dedicated scrollport—then sticky `top` must match that scrollport. Remove vertical clipping (`overflow-clip`) from the calendar section (or limit clip to non-sticky axes) so sticky works.

### Shared toolbar (sticky in all modes)

Title (`calendarTitle`) + mode pills (日 / 周 / 月 / **年**) + prev / today|this week|this month|this year / next.

### Sticky stacks by mode

| Mode | Sticky stack (top → bottom) | Scrolls |
|------|-----------------------------|---------|
| Day | Toolbar → date row (lunar + day) → weekday row → all-day row | Hour timeline |
| Week | Same as day | 7-column timeline |
| Month | Toolbar → weekday row (日…六) | Each week’s date-number row + task lanes |
| Year | Toolbar | 12-month heatmap body |

### Month specifics (option A)

- Still one month of weeks from API.
- Per-week lunar/day-number rows scroll with that week’s tasks (do **not** pin every week’s date row—would stack incorrectly).
- Month changes only via toolbar arrows / “本月”; sticky title updates with `calendarAnchor`.

### Implementation sketch

- Extract a sticky header composition used by day/week/month/year (toolbar always; mode-specific strips below).
- Day/week: move existing sticky content under the toolbar inside one sticky column.
- Month: move weekday strip into sticky; `ScheduleCalendarMonth` renders week bodies only.
- Opaque background + adequate `z-index` so tasks do not show through.

---

## §3 Web year heatmap

### API (existing — no protocol change)

`GET /views/schedule/calendar?view=year&anchor=<YYYY-MM-DD>&timezone=<IANA>`

Response (already implemented server-side):

- `view: "year"`, `year: number`, `months: CalendarMonthSummary[]`
- Each month: `month`, `task_count`, `todo_count`, `done_count`, `days: { key, task_count }[]`

### Web type / nav updates

- Extend `CalendarViewMode` and `ScheduleCalendarView` with `"year"`, `year`, `months`, heat day types.
- `CALENDAR_VIEW_MODES` add `{ key: "year", label: "年" }`.
- `shiftCalendarAnchor` / `calendarTitle` / `calendarTodayLabel` / `calendarNavStepLabel` support year (±1 year, “今年”, title `YYYY年`).
- `useScheduleViews` / `fetchScheduleCalendar` already pass `view`; ensure year is accepted end-to-end.

### UI

- 12 mini month grids (responsive, e.g. 3×4 on desktop).
- Cell fill by `task_count` buckets (same hue): `0` empty/light; then roughly `1`, `2–3`, `4–6`, `7+` darker.
- Today: optional ring/outline.
- Empty days remain clickable.

### Interaction

- Click day → set anchor to that `key`, set mode to `day`.
- Optional later: click month label → month view (not required for v1).

### Scope

- Web only. iOS year mode out of scope for this change.

---

## Testing

- Web: done/archived calendar titles strikethrough; todo/doing not; quadrants/swimlane unchanged.
- iOS: same for calendar cards.
- Day/week: scroll page — toolbar + date/weekday/all-day remain fixed; timeline scrolls.
- Month: toolbar + weekday sticky; week date rows + tasks scroll; arrow changes month.
- Year: loads 12 months; color scales with counts; click day opens day view; year nav works.
- Production build: no `.ts` import extensions in app source.

## Success criteria

1. Done/archived calendar titles show strikethrough on Web and iOS calendars only.
2. Day/week sticky includes mode-switcher toolbar.
3. Month has sticky toolbar + weekday row without continuous multi-month scroll.
4. Year mode heatmap works from existing year API; day click → day view.
5. Sticky works under page scroll (no blocking `overflow-clip` on the sticky ancestor).
