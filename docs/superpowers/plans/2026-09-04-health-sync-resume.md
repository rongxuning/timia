# Health Sync Resume Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Day-chunked HealthKit sync with local watermark after each day; keep 90-day first window.

**Architecture:** `HealthSyncService.syncWindow` iterates day slices, uploads each, stores `lastSyncedAt`, then one `finishRun`. UI/background call `syncWindow`. Status refresh takes `max(local, server)`.

**Tech Stack:** Swift / HealthKit / existing HealthSyncAPI

## File map

| File | Change |
|------|--------|
| `HealthSyncService.swift` | day slices, per-day upload + local watermark, end `finishRun` |
| `HealthSyncView.swift` | use `syncWindow`; merge watermark; progress copy; background task |
| `HealthBackgroundDelivery.swift` | call `syncWindow` |

## Tasks

### Task 1: HealthSyncService day chunking

- Add `daySlices(from:to:)` using `Calendar.current`
- Refactor `upload` to optional skip finish / return stats
- `syncWindow` loops slices, advances local watermark, one finish at end

### Task 2: UI + background

- `HealthSyncView.sync` → `syncWindow`
- Progress: `正在同步 第 N/M 天 · YYYY-MM-DD`
- `refreshStatus`: `max(local, server)`
- `beginBackgroundTask` around sync
- Background delivery uses `syncWindow`
