# iOS Sticky All-Day Implementation Plan

> **For agentic workers:** Implement task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Pin all-day rows under the date/week header in iOS day and week calendar modes.

**Architecture:** Lift `AllDayRow` / `WeekAllDayRow` out of timeline sections into fixed siblings below the date strip; bind content to `selectedDate` via existing visible-day/week callbacks.

**Tech Stack:** SwiftUI (`ScheduleHomeView.swift`)

## Global Constraints

- iOS only; do not change Web
- Preserve accessibility ids used by UITests (`calendar-week-all-day-*`, `calendar-week-date-*`)
- Keep empty-state copy and card styling as-is

---

### Task 1: Sticky all-day in day mode

**Files:** `codes/mobile/ios/Timia/Features/Schedule/ScheduleHomeView.swift`

- [ ] Add `AllDayRow` under `DateStrip` in `DayScheduleView`, fed by `daysByAnchor[dayKey(selectedDate)]`
- [ ] Remove `AllDayRow` from `DayTimelineSection`
- [ ] Keep date label + `TimelineGrid` in the section

### Task 2: Sticky all-day in week mode

**Files:** same

- [ ] Add `WeekAllDayRow` under `PagedWeekHeader` in `WeekScheduleView`, fed by current week in `weeksByAnchor`
- [ ] Remove `WeekAllDayRow` from `WeekTimelineSection`
- [ ] Preserve left 48pt gutter / trailing padding so UITest column alignment still holds

### Task 3: Docs + ship

- [ ] Spec + plan already written under `docs/superpowers/`
- [ ] Commit, push, open PR
- [ ] List remaining iOS vs Web differences in PR / summary
