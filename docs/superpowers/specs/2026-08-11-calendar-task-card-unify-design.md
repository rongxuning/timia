# Calendar Task Card Unify Design

**Date:** 2026-08-11  
**Scope:** Web calendar task cards in day / week / month modes only  
**Out of scope:** Priority quadrants, swimlane kanban, backend layout APIs

## Goal

Unify the visual structure of calendar task cards across day, week, and month so every card shows the same chrome, fixed slots (no layout jump when optional fields are empty), consistent padding, and a shared minimum height that fully fits four text rows plus corner controls.

## Decisions (confirmed)

| Topic | Choice |
|-------|--------|
| Time row | Start–end range (existing `formatScheduleTimeRange`) |
| No assignee | Gray `?` placeholder avatar, same size as real avatar |
| Short timed blocks | Raise min height so four rows + corners stay fully visible (no clip) |
| Hour row height (day/week) | Double: `48px` → `96px` |
| Month lane height | Same as unified card height (three modes consistent) |
| Approach | Extract shared `CalendarTaskCard`; month bar + timeline both consume it |

## Layout

```
┌──────────────────────────────────────────┐
│ [✓]  Title                        [Avatar│
│      Workspace / Project           or ? ]│
│      Start – End time                    │
│      Description               Priority  │
└──────────────────────────────────────────┘
```

| Region | Rule |
|--------|------|
| Top-left | `TaskStatusIcon` (completion toggle when allowed); always reserved |
| Middle | Exactly four fixed rows: title → workspace/project → time range → body; empty optional rows keep equal-height placeholders |
| Top-right | Assignee avatar, or gray `?` placeholder of the same size |
| Bottom-right | Priority label (e.g. `P4 高`); always shown |
| Padding | Uniform inset from card edges (target `4px`); middle column reserves fixed gutters for status / avatar / priority so text never overlaps |

**Remove** the fifth middle “跨天” row. Cross-day context stays in the time-range string and tooltips.

**Month continuation segments** (`showLabel=false`): keep unlabeled color strip only; do not render full card chrome (avoids repeating the four lines on every segment).

## Heights & timeline

Introduce one shared constant, e.g. `CALENDAR_TASK_CARD_HEIGHT_PX` (target **`72px`**; bump to `80px` only if implementation measurement shows clipping—still one shared value).

| Use | Current | Target |
|-----|---------|--------|
| Month lane / `gridAutoRows` | `64px` | `= CALENDAR_TASK_CARD_HEIGHT_PX` |
| Day/week min block height | `28px` | `= CALENDAR_TASK_CARD_HEIGHT_PX` |
| Day/week hour height | `48px` | **`96px`** |
| Full-day timeline height | `1152px` | **`2304px`** (`24 × 96`) |

- Timed block height = `max(CALENDAR_TASK_CARD_HEIGHT_PX, durationInHours × 96)`.
- Month task bars use the same card height (width/span vary; height does not).
- 15-minute snap: `SNAP_MINUTES_PX` becomes `24` (`(15/60)×96`). `snapYTo15Min` must use the real hour height (today `hourHeight` is passed but snap math is tied to a hard-coded 48px-derived constant—fix as part of this work).
- Drag preview: middle time row may show preview range (highlighted); slot count and positions unchanged.

## Component boundaries

### New

- **`CalendarTaskCard.tsx`** — sole card face: status, four lines, avatar/`?`, priority, padding/gutters. Props cover `item`, completion loading/handler, `showProjectContext`, optional preview times, and chrome needed by month (rounding / left stripe handled by outer wrapper or passed through).

### Thin / adjust

- **`CalendarTaskBar`** — month / all-day outer `button` (drag, radius, color stripe); renders `CalendarTaskCard` when `showLabel`; blank continuation when not.
- **`CalendarTimelineColumn`** — positioned `button` only; replace inline status/lines/avatar/priority with `CalendarTaskCard`.
- **`CalendarTaskCardLines`** — four fixed slots only; drop “跨天” fifth row; keep equal-height empty placeholders.
- **`AssigneeAvatar`** (or card wrapper) — support no-assignee `?` placeholder at compact size.
- **`taskUtils` / `calendarDayLayout`** — shared card height; hour height `96`; min block = card height; snap px tied to hour height.

### Unchanged

- Backend schedule layout / calendar view APIs
- Priority quadrants and swimlane cards
- Reschedule PATCH flow (only snap pixel math adapts to new hour height)

## Data / copy

- Time: keep `formatScheduleTimeRange` (same-day `HH:MM - HH:MM`; cross-day with dates; missing end → start only).
- Priority: keep `priorityLabel`.
- Empty body / missing time / hidden project context: placeholder rows of fixed height (project row already supports `showProjectContext === false` spacer).

## Testing

- Update unit tests that assume `48` hour height / `SNAP_MINUTES_PX` (`snapAndFormat.test.mts`, related helpers).
- Manual: same task in day/week/month; no assignee / no body / no time; short-duration timed block ≥ card height; drag snap still 15 minutes; month unlabeled continuation still strip-only.

## Success criteria

1. Day, week, and month labeled cards share one structure and one min height.
2. Optional fields never shift sibling slots.
3. Status, avatar/`?`, and priority corners always present on labeled cards.
4. Day/week hour rows are twice the previous height; snap remains correct.
5. No regression to reschedule drop semantics beyond pixel scaling.
