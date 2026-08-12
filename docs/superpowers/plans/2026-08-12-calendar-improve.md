# Calendar Improve Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Calendar title strikethrough (Web+iOS), expanded Web sticky headers, Web year heatmap.

**Architecture:** Shared Web card lines for strikethrough; restructure `ScheduleCalendar` sticky shell; extend types/nav + new `ScheduleCalendarYear` on existing `view=year` API.

**Tech Stack:** Next.js/React/Tailwind; SwiftUI iOS; FastAPI year view already exists.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-08-12-calendar-improve-design.md`
- Strikethrough: `done` + `archived`, calendar cards only
- Month sticky: toolbar + weekday only (single month)
- Year: Web only; click day → day view
- No `.ts` extensions in production imports

---

## File map

| File | Role |
|------|------|
| `CalendarTaskCardLines.tsx` | Web title strikethrough |
| iOS Schedule calendar title sites | iOS strikethrough |
| `ScheduleCalendar.tsx` | Sticky shell, year mode wiring, remove overflow-clip |
| `ScheduleCalendarDay/Week.tsx` | Nested sticky under toolbar (or accept toolbar+body sticky composition) |
| `ScheduleCalendarMonth.tsx` | Week bodies only; weekday moved up |
| `calendarNav.ts` | Year mode labels/shift |
| `types/api/views/schedule.ts` | Year/months/heat day types |
| `ScheduleCalendarYear.tsx` | **New** heatmap UI |
| `useScheduleViews` / fetch | Pass year view |

---

### Task 1: Strikethrough

- [ ] Web: in `CalendarTaskCardLines`, if done/archived add `line-through opacity-70` on title
- [ ] iOS: find calendar task `Text(task.title)` in Schedule calendar views; apply strikethrough for done/archived
- [ ] Commit: `feat: strikethrough done/archived titles on calendar cards`

### Task 2: Sticky headers

- [ ] Remove `overflow-clip` from calendar section (keep rounded border without blocking sticky)
- [ ] Compose sticky stack: toolbar always sticky; day/week include date/weekday/all-day; month include weekday row
- [ ] Commit: `feat: expand calendar sticky header to include mode toolbar`

### Task 3: Year heatmap

- [ ] Extend types + `calendarNav` for year
- [ ] Add `ScheduleCalendarYear`; wire in `ScheduleCalendar`
- [ ] Click day → day mode + anchor
- [ ] Commit: `feat: add calendar year heatmap view`

### Task 4: Verify

- [ ] `npx tsc --noEmit` in web
- [ ] Manual checklist from spec
