# Health Sync Performance & Background Drain

## Goal

Make health sync fast enough for a 90-day first catch-up, and reliable enough that incremental updates can advance while the app is backgrounded—without abandoning the existing day-chunked server watermark.

Concrete outcomes:

1. **First sync / long catch-up** is materially faster (fewer round-trips wasted on recomputes, smaller payloads, safer concurrency).
2. **Incremental sync** can progress on HealthKit observer wakes and short background budgets without requiring the user to keep the Health sync screen open.
3. **Idempotency and resume** stay intact: `(owner_user_id, hk_uuid)` upserts, day checkpoints, server-authoritative watermark after clear.

## Context (current state)

End-to-end today:

```
HealthKit → iOS HealthSyncService (day slices) → FastAPI batch upserts → Postgres
```

What already works:

- Day-chunked resume + `POST /health/sync/checkpoint` + `health_sync_state` watermark ([2026-09-04-health-sync-resume-design.md](./2026-09-04-health-sync-resume-design.md)).
- Server bulk `INSERT … ON CONFLICT` for quantity / sleep / stand / heartbeat / workout.
- Client within-category upload concurrency = 4.
- Server-authoritative watermark and clear-data path ([2026-09-04-health-clear-server-watermark-design.md](./2026-09-04-health-clear-server-watermark-design.md)).

What hurts:

| Pain | Cause |
|------|--------|
| Slow first sync | 90 local days × full HealthKit export × serial category uploads × uncompressed JSON × 30s timeout |
| Cannot sync in background | Background path has no durable queue / no `beginBackgroundTask`; first sync refused when watermark is nil; wakes still try a full `syncWindow` |
| Wasted server work | Every sync batch calls `recompute_daily_metrics` per touched `local_date`, often repeating the same day many times in one catch-up |
| Redundant re-upload | Fixed 2h overlap + no `HKQueryAnchor` ⇒ re-export/re-upsert recent samples on every wake |
| Deletion gap | `POST /health/sync/deletions` exists; client never calls it |

## Approaches considered

| | A. Client-heavy | B. Server-heavy | **C. Phased hybrid (chosen)** |
|---|---|---|---|
| Idea | Local queue + anchors + gzip; minimal server | Async ingest + deferred recompute; thin client | Keep day watermark; add queue/anchors/compression; coalesce recomputes; index polish |
| First-sync speed | High | Medium (export still dominates) | High |
| Background viability | High | Low (long window still on wake) | High |
| Risk / ops | Queue consistency | New server workers | Clear phase boundaries, easy rollback |

**Choice: C.** Existing resume semantics are validated; the gaps are incremental export, durable pending uploads, short background drains, payload size, and recompute churn.

## Non-goals

- Android / Health Connect.
- Shortening the 90-day first lookback.
- Client skip via server UUID inventory.
- Live heart-rate streaming (near-real-time remains the product bar).
- Replacing day checkpoints with a purely anchor-only server protocol.

## Architecture

Keep **server watermark + per-day checkpoint**. Add a client **durable outbox** and switch incremental export to **per-type HK anchors**. First sync still uses the time-window day slices.

```
HealthKit
   │ HKObserver / manual sync
   ▼
Exporter
   │ first sync: day time-window
   │ incremental: per-type HKQueryAnchor
   ▼
SQLite Outbox (pending batches + deletions)
   │
   ├─ Manual / foreground: beginBackgroundTask, drain aggressively
   └─ Background wake: budgeted drain (N batches or ~20s), then stop
   ▼
HTTP gzip JSON ──▶ FastAPI /health/sync/*
   │                 bulk upsert (existing)
   │                 collect dirty local_dates
   │                 recompute once per date (or defer)
   ▼
checkpoint(to_at) / finishRun
   (only when that local day is fully exported AND its outbox rows are empty)
```

### Dual progress tracks

| Mechanism | Meaning |
|-----------|---------|
| **HKQueryAnchor (local)** | How far HealthKit has been read |
| **Outbox row status** | What still needs upload; survives process death |
| **Server watermark + day checkpoint** | What the server has confirmed; authoritative after Web clear |

### Rules

1. **First sync:** `watermark == nil` → foreground only. Day export → enqueue → upload → day checkpoint. Background must not attempt the full 90-day window.
2. **Incremental:** Observer wake → anchor delta → enqueue → budgeted drain; no UI required.
3. **Watermark advance:** Checkpoint a day only after that day’s export is done **and** outbox has no pending rows for that `local_date`.
4. **Clear data:** Server clears watermark → client clears anchors + outbox + local cache → return to first-sync path.
5. **Ordering:** `workouts` before `routes`. Other categories may run in parallel after Phase 4.

### Component map

| Component | Location | Role |
|-----------|----------|------|
| `HealthSyncQueue` | iOS SQLite | Durable outbox |
| `HealthKitAnchorStore` | iOS | Persist per-type anchors |
| `HealthSyncDrain` | iOS | Shared upload scheduler (manual + background) |
| `HealthBackgroundDelivery` | iOS | Wake → export+enqueue → `drain(budget:)` |
| gzip encode/decode | iOS URLSession + FastAPI middleware | Compress sync POST bodies |
| recompute coalesce | `health_api.py` | One recompute per `local_date` per request (optional dirty defer) |
| partial indexes | Alembic | `WHERE deleted_at IS NULL` on sample tables |

## Phased delivery

### Phase 1 — Transport & server hotspots (fast, low risk)

| Item | Design |
|------|--------|
| Compression | Client gzip on sync POST bodies; `Content-Encoding: gzip`. Server middleware decompresses. Prefer samples / heartbeats / routes. Uncompressed still accepted. |
| Batch sizes | Keep API shapes. Optionally raise quantity batch to **800–1000** once gzip + 60s timeout land. |
| Recompute coalesce | Within one HTTP request, recompute each distinct `local_date` **once**. Optional 1b: mark dirty during ingest, recompute at end of request or via short deferred job. |
| Indexes | Partial B-tree indexes `WHERE deleted_at IS NULL` on quantity / sleep / stand / heartbeat / workout primary time indexes. |
| Timeouts | Client sync `timeoutInterval`: **30 → 60**. |

### Phase 2 — Background-capable drain

| Item | Design |
|------|--------|
| Outbox schema | `id, category, payload_json, local_date, created_at, attempts, status` (`pending` / `uploading` / `failed`). Delete or mark done on ACK. |
| Unified drain | Manual and background share one path. Background: `beginBackgroundTask` + budget (e.g. max 8 batches or ~20s). Stop on clean batch boundaries. |
| First-sync gate | Unchanged: no watermark ⇒ background path returns without full window. |
| Optional BGTaskScheduler | `BGAppRefreshTask` / `BGProcessingTask` for longer drains when the system grants time. |
| Concurrency | Keep category-internal concurrency at 4; allow config up to 6 after load testing. |

### Phase 3 — Incremental export

| Item | Design |
|------|--------|
| HKQueryAnchor | Persist one anchor per quantity/type (and analogous queries for sleep / stand / workout / heartbeat). |
| Relationship to day window | First sync still fills outbox via 90-day day slices; after success, write anchors. Later syncs are anchor-only. |
| Overlap | With healthy anchors, **drop the fixed 2h re-upload overlap**. On anchor loss or clear, fall back to a short time window (e.g. 2 days) to heal gaps, then rewrite anchors. |
| Deletions | Wire HealthKit delete callbacks to existing `POST /health/sync/deletions`. |

### Phase 4 — Concurrency & pipeline

| Item | Design |
|------|--------|
| Safe cross-category parallel | `samples ∥ sleep ∥ stand ∥ heartbeats`; `workouts` then `routes`. |
| Day prefetch | During foreground first sync, while uploading day N, prefetch HealthKit for day N+1 (pipeline). Do not parallel-write the same local day. |
| Rolling window | Keep day checkpoints. Advance watermark only in `local_date` order when that day’s outbox is empty. |

## Error handling

| Scenario | Behavior |
|----------|----------|
| 5xx / timeout / network drop | Increment `attempts`, keep `pending`, exponential backoff; do not checkpoint |
| 4xx `batch_too_large` / validation | Split batch in half once; if still failing, mark `failed` and surface; do not block unrelated later days forever |
| Auth failure | Stop drain; resume after re-login |
| iOS ends background task | Stop at batch boundary; ACKed rows stay done; unacked stay pending |
| Anchor query failure / corruption | Drop that type’s anchor; heal with a short time window; rewrite anchor on success |
| Web clear health data | Server watermark nil; client clears anchors + outbox + local watermark; force foreground first sync |
| Bad gzip | Server `400 content_encoding_invalid`; client retries that batch uncompressed |

## Success criteria

- First 90-day sync wall time drops **≥30–50%** vs current baseline on a real device (instrumented; exact number depends on HealthKit volume).
- With a watermark present, lock-screen / observer wakes **reduce `outbox_pending`**; process death does not lose pending rows or re-export anchored data.
- After clear-data, first-sync path runs correctly again.
- Upserts remain idempotent; daily metrics match current semantics for the same inputs.

## Telemetry (minimum)

- Client: `sync.export_ms`, `sync.upload_ms`, `sync.batch_bytes`, `sync.gzip_ratio`, `sync.outbox_pending`, `sync.drain_batches`, `sync.bg_budget_hit`.
- Server: `recompute_count_per_request`, per-batch latency.

## Testing

### Server

- Gzip middleware: compressed and plain bodies succeed; corrupt gzip → 400.
- Recompute coalesce: multiple dates / repeated same date in one request → one recompute per date.
- Partial-index migration upgrades cleanly; existing `test_health_api.py` stays green.
- Deletion endpoint regression (prep for client wiring).

### iOS

- Outbox: enqueue → ACK deletes/marks done; failure retains; kill-and-resume.
- Drain budget: stops on budget and leaves consistent state.
- Anchors: incremental export only new samples; clear resets to full export.
- Background: nil watermark no-ops; with watermark only budgeted drain.
- Ordering: workouts before routes.

### Manual / device

- Compare 90-day first sync duration and bytes before/after.
- Confirm pending count moves while locked.
- Clear data → re-authorize → first sync.

## Rollout / PR order

1. **P1a** — Server gzip + recompute coalesce.
2. **P1b** — Partial index migration.
3. **P1c** — Client gzip + 60s timeout (+ optional larger quantity batches).
4. **P2** — Outbox + unified drain + background `beginBackgroundTask` (**background sync gate**).
5. **P3** — HK anchors + drop fixed 2h overlap + client deletions.
6. **P4** — Cross-category parallel + day prefetch.

Each phase is independently mergeable. Rollback: feature-flag gzip; leave uncompressed path; lower concurrency/batch caps; clear local anchors/outbox to re-enter time-window sync.

## Key files (expected touch set)

### Server

- `codes/core-service/app/services/health_api.py` — coalesce recompute; optional dirty set.
- `codes/core-service/app/routes/health.py` — unchanged contracts preferred; middleware wiring if needed.
- New gzip middleware (or Starlette/FastAPI request body hook).
- `codes/core-service/app/migrations/versions/00xx_health_partial_indexes.py`.
- `codes/core-service/tests/test_health_api.py` (+ gzip / coalesce tests).

### iOS

- `codes/mobile/ios/Timia/Core/Health/HealthSyncService.swift` — orchestrate export vs drain.
- New: `HealthSyncQueue.swift`, `HealthKitAnchorStore.swift`, `HealthSyncDrain.swift`.
- `HealthBackgroundDelivery.swift` — budgeted drain.
- `HealthSyncAPI.swift` — gzip bodies, timeout.
- `HealthKitStore.swift` — anchored queries + deletion callbacks.
- `HealthSyncView.swift` — use shared drain; keep UX progress.

## Relationship to prior specs

- Extends [health-sync-resume](./2026-09-04-health-sync-resume-design.md): day slices remain for first sync and watermark advance rules tighten to “day exported **and** outbox empty”.
- Respects [clear watermark](./2026-09-04-health-clear-server-watermark-design.md): clear resets client anchors/outbox.
- Partially realizes backlog from [health-domain](./2026-08-27-health-domain-design.md) (local queue, anchors, background budget) that was never shipped.
