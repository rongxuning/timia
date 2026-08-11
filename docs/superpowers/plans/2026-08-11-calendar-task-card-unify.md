# Calendar Task Card Unify Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Unify day/week/month calendar task cards into one shared face with fixed slots, placeholder avatar, shared min height, and doubled day/week hour row height.

**Architecture:** Extract inner `CalendarTaskCard` (status + four lines + avatar/`?` + priority). Outer wrappers (`CalendarTaskBar`, timeline `button`) keep drag/colors/geometry. Shared constants: `CALENDAR_TASK_CARD_HEIGHT_PX=72`, `DAY_TIMELINE_HOUR_HEIGHT_PX=96`; snap math derives from hour height.

**Tech Stack:** Next.js / React / TypeScript / Tailwind; node `--experimental-strip-types` for local `.mts` tests under `codes/web/src/components/schedule/`.

## Global Constraints

- Scope: web calendar day/week/month labeled cards only (not priority quadrants / swimlane).
- Time row: start–end via existing `formatScheduleTimeRange`.
- No assignee: gray `?` avatar, same compact size.
- No clip of four rows + corners on labeled cards; min block/lane height = card height.
- Hour height: `48 → 96`; `SNAP_MINUTES_PX = (15/60)*96 = 24`.
- Remove middle “跨天” fifth row.
- Month `showLabel=false`: unlabeled color strip only.
- Spec: `docs/superpowers/specs/2026-08-11-calendar-task-card-unify-design.md`.

---

## File map

| File | Responsibility |
|------|----------------|
| `codes/web/src/components/schedule/taskUtils.ts` | `CALENDAR_TASK_CARD_HEIGHT_PX`, lane height alias, `SNAP_MINUTES_PX` / `snapYTo15Min` tied to hour height |
| `codes/web/src/components/schedule/calendarDayLayout.ts` | `DAY_TIMELINE_HOUR_HEIGHT_PX=96`, min block = card height |
| `codes/web/src/components/schedule/snapAndFormat.test.mts` | Assert snap at 96px hour / 24px slot |
| `codes/web/src/components/schedule/AssigneeAvatar.tsx` | Optional empty `?` placeholder |
| `codes/web/src/components/schedule/CalendarTaskCardLines.tsx` | Exactly four fixed slots; drop `crossesDay` row |
| `codes/web/src/components/schedule/CalendarTaskCard.tsx` | **New** shared inner card face |
| `codes/web/src/components/schedule/CalendarTaskBar.tsx` | Outer month/all-day button → `CalendarTaskCard` |
| `codes/web/src/components/schedule/CalendarTimelineColumn.tsx` | Outer timed button → `CalendarTaskCard`; fix hard-coded `48` |
| `codes/web/src/components/schedule/CalendarAllDayRow.tsx` | All-day bar wrapper height = card height (today `h-8`) |
| `codes/web/src/components/schedule/ScheduleCalendarMonth.tsx` | Uses lane height constant (no logic change if alias updated) |

---

### Task 1: Height + snap constants (TDD)

**Files:**
- Modify: `codes/web/src/components/schedule/taskUtils.ts`
- Modify: `codes/web/src/components/schedule/calendarDayLayout.ts`
- Modify: `codes/web/src/components/schedule/snapAndFormat.test.mts`

**Interfaces:**
- Produces:
  - `CALENDAR_TASK_CARD_HEIGHT_PX = 72`
  - `CALENDAR_LANE_HEIGHT_PX` equals card height (keep export name for month)
  - `DAY_TIMELINE_HOUR_HEIGHT_PX = 96`
  - `SNAP_MINUTES_PX = (SNAP_MINUTES / 60) * DAY_TIMELINE_HOUR_HEIGHT_PX` (or compute inside `snapYTo15Min` from `hourHeight`)
  - `snapYTo15Min(y, hourHeight = DAY_TIMELINE_HOUR_HEIGHT_PX): number` uses `hourHeight` for px/min (do not ignore the param)

- [ ] **Step 1: Rewrite failing snap tests for 96px hour**

Replace the duplicated helpers / cases in `snapAndFormat.test.mts` so they target 96px hour and 24px per 15min. Prefer importing from source once exports exist; for the red step, inline expected math:

```ts
const HOUR_HEIGHT = 96;
const SNAP_MINUTES = 15;
const SNAP_MINUTES_PX = (SNAP_MINUTES / 60) * HOUR_HEIGHT; // 24

// Expected examples after fix:
// snapY(0) → 0
// snapY(24) → 0.25
// snapY(48) → 0.5
// snapY(96) → 1
// snapY(9*96) → 9
// snapY(9*96 + 24) → 9.25
// clamp: snapY(-10) → 0; snapY(96*30) → 24
// yToTimeStr(96) → "01:00"; yToTimeStr(9*96+48) → "09:30"
```

Keep `formatFloatHour` cases unchanged.

- [ ] **Step 2: Run test — expect FAIL against current 48px math if still importing old behavior; or update test first then fail production import**

Run:

```bash
cd codes/web && node --experimental-strip-types --no-warnings src/components/schedule/snapAndFormat.test.mts
```

If the test still inlines old `snapYTo15Min` with 48, change Step 1 to import:

```ts
import { snapYTo15Min, formatFloatHour, SNAP_MINUTES_PX } from "./taskUtils.ts";
import { DAY_TIMELINE_HOUR_HEIGHT_PX } from "./calendarDayLayout.ts";
```

…and assert `DAY_TIMELINE_HOUR_HEIGHT_PX === 96` and `SNAP_MINUTES_PX === 24` — these fail until Step 3.

- [ ] **Step 3: Implement constants + snap fix**

In `calendarDayLayout.ts`:

```ts
import { CALENDAR_TASK_CARD_HEIGHT_PX } from "./taskUtils";

export const DAY_TIMELINE_HOUR_HEIGHT_PX = 96;
export const DAY_TIMELINE_HEIGHT_PX = 24 * DAY_TIMELINE_HOUR_HEIGHT_PX;
const MIN_BLOCK_HEIGHT_PX = CALENDAR_TASK_CARD_HEIGHT_PX;
```

(If circular import: define `CALENDAR_TASK_CARD_HEIGHT_PX` in `taskUtils`, and set `MIN_BLOCK_HEIGHT_PX` by importing it; avoid importing layout from `taskUtils`.)

In `taskUtils.ts`:

```ts
export const CALENDAR_TASK_CARD_HEIGHT_PX = 72;
export const CALENDAR_LANE_HEIGHT_PX = CALENDAR_TASK_CARD_HEIGHT_PX;
export const CALENDAR_LANE_GAP_PX = 4;

export const SNAP_MINUTES = 15;
/** Default assumes day/week hour height 96; prefer passing hourHeight into snapYTo15Min. */
export const SNAP_MINUTES_PX = (SNAP_MINUTES / 60) * 96;

export function snapYTo15Min(y: number, hourHeight = 96): number {
  const pxPerSnap = (SNAP_MINUTES / 60) * hourHeight;
  const totalMin = Math.round(y / pxPerSnap) * SNAP_MINUTES;
  return Math.max(0, Math.min(24, totalMin / 60));
}
```

Remove any stale comment that says `48px/h × 0.25h = 12px`.

- [ ] **Step 4: Re-run snap tests — expect PASS**

```bash
cd codes/web && node --experimental-strip-types --no-warnings src/components/schedule/snapAndFormat.test.mts
```

Expected: `passed` > 0, `failed: 0`.

- [ ] **Step 5: Commit**

```bash
git add codes/web/src/components/schedule/taskUtils.ts \
  codes/web/src/components/schedule/calendarDayLayout.ts \
  codes/web/src/components/schedule/snapAndFormat.test.mts
git commit -m "$(cat <<'EOF'
fix: calendar card height 72 and day/week hour 96 with snap

EOF
)"
```

---

### Task 2: Assignee `?` placeholder

**Files:**
- Modify: `codes/web/src/components/schedule/AssigneeAvatar.tsx`

**Interfaces:**
- Produces: `AssigneeAvatar({ displayName?: string | null; size?: "compact" | "default" | "large" })` — when name empty/missing, render `?` with same size classes and muted styling.

- [ ] **Step 1: Extend `AssigneeAvatar`**

```tsx
type AssigneeAvatarProps = {
  displayName?: string | null;
  size?: "compact" | "default" | "large";
};

export function AssigneeAvatar({ displayName, size = "default" }: AssigneeAvatarProps) {
  const sizeClass =
    size === "compact"
      ? "h-4 w-4 text-[8px]"
      : size === "large"
        ? "h-6 w-6 text-[10px]"
        : "h-5 w-5 text-[9px]";

  const name = displayName?.trim() ?? "";
  const letter = (name.slice(0, 1) || "?").toUpperCase();
  const title = name || "未指定负责人";

  return (
    <div
      className={[
        "flex shrink-0 items-center justify-center rounded-full border border-white bg-surface-container font-bold text-on-surface-variant",
        sizeClass,
        !name ? "opacity-70" : "",
      ].join(" ")}
      title={title}
      aria-label={title}
    >
      {letter}
    </div>
  );
}
```

- [ ] **Step 2: Smoke-check TypeScript**

```bash
cd codes/web && npx tsc --noEmit --pretty false 2>&1 | head -40
```

Expected: no new errors from `AssigneeAvatar` call sites (existing required `displayName` still valid).

- [ ] **Step 3: Commit**

```bash
git add codes/web/src/components/schedule/AssigneeAvatar.tsx
git commit -m "$(cat <<'EOF'
feat: assignee avatar supports empty placeholder

EOF
)"
```

---

### Task 3: Four-slot `CalendarTaskCardLines`

**Files:**
- Modify: `codes/web/src/components/schedule/CalendarTaskCardLines.tsx`

**Interfaces:**
- Produces: props without `crossesDay` (remove prop and fifth row). Keep four slots with equal-height placeholders for empty project/time/body. Keep `previewStartAtIso` / `previewEndAtIso`.

- [ ] **Step 1: Strip `crossesDay` and keep four slots only**

Final structure:

```tsx
<div className="flex min-w-0 flex-1 flex-col justify-start gap-px leading-none">
  {/* title — always real text */}
  {/* workspace/project OR h-[10px] spacer when !showProjectContext; when showProjectContext always show text (names always present on ScheduleTaskItem) */}
  {/* timeRangeLabel OR h-[10px] spacer */}
  {/* bodyText OR h-[10px] spacer */}
</div>
```

Use `justify-start` (not `justify-center`) so rows pin to the top under the status/title alignment.

Remove all `crossesDay` props/branches.

- [ ] **Step 2: Fix call sites that pass `crossesDay`**

Search and remove `crossesDay={...}` from `CalendarTimelineColumn.tsx` (will be replaced in Task 5; for this task, delete the prop so `tsc` stays clean even before Task 5 finishes, or leave until Task 5 if doing sequentially in one agent — **this plan requires deleting the prop usage in this task**).

```bash
rg -n "crossesDay" codes/web/src/components/schedule
```

Expected: no matches after this task.

- [ ] **Step 3: Commit**

```bash
git add codes/web/src/components/schedule/CalendarTaskCardLines.tsx \
  codes/web/src/components/schedule/CalendarTimelineColumn.tsx
git commit -m "$(cat <<'EOF'
refactor: calendar card lines keep four fixed slots only

EOF
)"
```

---

### Task 4: Add `CalendarTaskCard`

**Files:**
- Create: `codes/web/src/components/schedule/CalendarTaskCard.tsx`

**Interfaces:**
- Consumes: `CalendarTaskCardLines`, `TaskStatusIcon`, `AssigneeAvatar`, `priorityLabel`
- Produces:

```ts
export type CalendarTaskCardProps = {
  item: ScheduleTaskItem;
  showProjectContext: boolean;
  completingItemId?: string | null;
  onCompleteTask?: (itemId: string) => void;
  compact?: boolean;
  previewStartAtIso?: string | null;
  previewEndAtIso?: string | null;
};
```

- [ ] **Step 1: Implement shared inner face**

```tsx
"use client";

import type { ScheduleTaskItem } from "@/types/api/views/schedule";
import { AssigneeAvatar } from "./AssigneeAvatar";
import { CalendarTaskCardLines } from "./CalendarTaskCardLines";
import { TaskStatusIcon } from "./TaskStatusIcon";
import { priorityLabel } from "./taskUtils";

export type CalendarTaskCardProps = {
  item: ScheduleTaskItem;
  showProjectContext: boolean;
  completingItemId?: string | null;
  onCompleteTask?: (itemId: string) => void;
  compact?: boolean;
  previewStartAtIso?: string | null;
  previewEndAtIso?: string | null;
};

export function CalendarTaskCard({
  item,
  showProjectContext,
  completingItemId = null,
  onCompleteTask,
  compact = false,
  previewStartAtIso,
  previewEndAtIso,
}: CalendarTaskCardProps) {
  const titleClassName = compact ? "text-[10px]" : "text-[11px]";
  const metaClassName = compact ? "text-[9px]" : "text-[10px]";

  return (
    <div className="relative flex h-full min-h-0 w-full min-w-0 items-start gap-1.5 p-1">
      <TaskStatusIcon
        size="compact"
        status={item.status}
        loading={completingItemId === item.id}
        onComplete={onCompleteTask ? () => onCompleteTask(item.id) : undefined}
      />
      <div className="min-w-0 flex-1 pr-8">
        <CalendarTaskCardLines
          item={item}
          showProjectContext={showProjectContext}
          titleClassName={titleClassName}
          metaClassName={metaClassName}
          previewStartAtIso={previewStartAtIso}
          previewEndAtIso={previewEndAtIso}
        />
      </div>
      <div className="pointer-events-none absolute right-1 top-1">
        <AssigneeAvatar displayName={item.assignee?.display_name} size="compact" />
      </div>
      <div
        className="pointer-events-none absolute bottom-1 right-1 text-[9px] font-medium tabular-nums opacity-80"
        title={priorityLabel(item.priority)}
        aria-label={priorityLabel(item.priority)}
      >
        {priorityLabel(item.priority)}
      </div>
    </div>
  );
}
```

Notes:
- Always render avatar (placeholder when no assignee).
- Always render priority.
- `p-1` = 4px uniform inset; `pr-8` on text column clears avatar/priority.

- [ ] **Step 2: Commit**

```bash
git add codes/web/src/components/schedule/CalendarTaskCard.tsx
git commit -m "$(cat <<'EOF'
feat: add shared CalendarTaskCard face

EOF
)"
```

---

### Task 5: Wire month/all-day + timeline consumers

**Files:**
- Modify: `codes/web/src/components/schedule/CalendarTaskBar.tsx`
- Modify: `codes/web/src/components/schedule/CalendarTimelineColumn.tsx`
- Modify: `codes/web/src/components/schedule/CalendarAllDayRow.tsx`

**Interfaces:**
- Consumes: `CalendarTaskCard`, `CALENDAR_TASK_CARD_HEIGHT_PX`, `DAY_TIMELINE_HOUR_HEIGHT_PX`
- Timeline outer `button` keeps absolute geometry / colors / drag; inner = `<CalendarTaskCard ... />`
- `CalendarTaskBar` when `showLabel`: inner = `<CalendarTaskCard ... />`; when not: `\u00a0` continuation
- Drop `showAssigneeAvatar` gating of avatar (card always shows avatar/`?`). Keep prop on bar for API stability but ignore it, **or** remove prop and update call sites — prefer **remove unused gating** and delete prop from bar + callers if trivial; otherwise leave prop unused with a one-line comment.

- [ ] **Step 1: Slim `CalendarTaskBar`**

Replace the labeled inner flex/status/lines/avatar/priority block with:

```tsx
{showLabel ? (
  <CalendarTaskCard
    item={item}
    showProjectContext={showProjectContext}
    completingItemId={completingItemId}
    onCompleteTask={onCompleteTask}
    compact={compact}
  />
) : (
  "\u00a0"
)}
```

Outer `button` keeps colors, radius, drag, `h-full`, `overflow-hidden`. Remove duplicate `p-1` from outer if card already pads (avoid double padding): outer should use `p-0` when labeled; card supplies `p-1`.

- [ ] **Step 2: Slim `CalendarTimelineColumn` task buttons**

Inside each block `button`, replace the flex + status + lines + avatar + priority with:

```tsx
<CalendarTaskCard
  item={block.item}
  showProjectContext={showProjectContext}
  completingItemId={completingItemId}
  onCompleteTask={onCompleteTask}
  compact={compact}
  previewStartAtIso={previewStartAtIso}
  previewEndAtIso={previewEndAtIso}
/>
```

Change outer button classes: use `p-0` (card pads). Keep absolute `top/height/left/width`, colors, drag, `setDragImage`.

Replace any hard-coded `48` (e.g. `buttonHour * 48`) with `DAY_TIMELINE_HOUR_HEIGHT_PX`.

- [ ] **Step 3: Raise all-day row bar height**

In `CalendarAllDayRow.tsx`, change wrapper from `h-8` to style/class using card height:

```tsx
<div
  key={item.id}
  className="min-w-0"
  style={{ height: CALENDAR_TASK_CARD_HEIGHT_PX }}
>
  <CalendarTaskBar ... />
</div>
```

Import `CALENDAR_TASK_CARD_HEIGHT_PX` from `./taskUtils`.

- [ ] **Step 4: Typecheck**

```bash
cd codes/web && npx tsc --noEmit --pretty false 2>&1 | head -50
```

Expected: clean for schedule components (or only pre-existing unrelated errors).

- [ ] **Step 5: Re-run snap tests**

```bash
cd codes/web && node --experimental-strip-types --no-warnings src/components/schedule/snapAndFormat.test.mts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add codes/web/src/components/schedule/CalendarTaskBar.tsx \
  codes/web/src/components/schedule/CalendarTimelineColumn.tsx \
  codes/web/src/components/schedule/CalendarAllDayRow.tsx
git commit -m "$(cat <<'EOF'
feat: use CalendarTaskCard in month, all-day, and timeline

EOF
)"
```

---

### Task 6: Manual verification checklist

**Files:** none (verification only)

- [ ] **Step 1: Run app**

```bash
# from repo root, if not already running
make verify
# or: make web / make core-service as needed
```

- [ ] **Step 2: Visual checks on `/my/schedule`**

1. Month / week / day: labeled card shows status (TL), four rows, avatar or `?` (TR), priority (BR).
2. Task without assignee → `?`; without body/time → empty slots, no shift.
3. Short timed event height ≥ 72px; 1h event ≈ 96px tall.
4. Hour labels / grid visually ~2× previous spacing.
5. Drag timed task: snap indicator still 15 minutes; preview time row updates.
6. Month continuation segment (`showLabel=false`) remains strip without four lines.
7. All-day row cards match card height (not 32px stubs).

- [ ] **Step 3: Commit only if verification found follow-up fixes**

If fixes were needed, commit them separately with a clear message; otherwise no commit.

---

## Self-review (plan vs spec)

| Spec requirement | Task |
|------------------|------|
| Shared card face | Task 4–5 |
| Fixed four middle rows | Task 3 |
| Status TL / avatar TR / priority BR | Task 4 |
| `?` when no assignee | Task 2 + 4 |
| Uniform padding / gutters | Task 4 |
| Remove 跨天 fifth row | Task 3 |
| Card height 72; month lane | Task 1 (`CALENDAR_LANE_HEIGHT_PX`) |
| Hour 96; min block = card | Task 1 |
| Snap uses real hour height | Task 1 |
| Timeline + month consumers | Task 5 |
| All-day height consistency | Task 5 Step 3 |
| Month unlabeled continuation | Task 5 (bar `showLabel=false` unchanged) |
| Quadrants/swimlane untouched | Global constraint |

No intentional placeholders left in steps.
