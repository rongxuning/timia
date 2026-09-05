# iOS Screen Notification (Live Activity) Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Lock-screen Live Activity with allow/deny prompt, health sync row, and today's all-day todos.

**Architecture:** ActivityKit + Widget Extension; preference in UserDefaults; content built by pure `ScreenNotificationContentBuilder`; manager starts/updates activity from app.

**Tech Stack:** SwiftUI, ActivityKit, WidgetKit, XcodeGen `project.yml` (+ committed `project.pbxproj`).

## Tasks

### Task 1: Shared attributes + preference + content builder + unit tests

**Files:**
- Create `Timia/Core/ScreenNotification/*`
- Create `TimiaTests/ScreenNotificationContentBuilderTests.swift`

### Task 2: Manager + prompt + account toggle + app wiring

**Files:**
- `ScreenNotificationManager.swift`, `ScreenNotificationPrompt.swift`
- `TimiaApp.swift`, `AccountView.swift`, `AppSession.swift`
- Health sync refresh hooks

### Task 3: Widget extension + project wiring

**Files:**
- `TimiaWidget/*`, `project.yml`, `Info.plist` (`NSSupportsLiveActivities`), `project.pbxproj`

### Task 4: Verify

- Unit tests for content builder
- On Mac: `xcodegen generate` then `xcodebuild` simulator build
