# Health Sync Day-Chunked Resume

## Goal

First sync still looks back **90 days**, but advances a watermark after each local calendar day so screen-lock / process death can resume without re-uploading completed days.

## Behavior

1. Window start unchanged: `lastSyncedAt - 2h` overlap, or `now - 90d` when unset.
2. Split `[start, end)` into local-calendar day slices (first/last may be partial days).
3. Per slice: HealthKit export → batch upload (samples → sleep → stand → workouts → routes → heartbeats).
4. After a slice succeeds: write local `timia.health.lastSyncedAt = sliceEnd` immediately.
5. After **all** slices succeed: one `POST /health/sync/runs` with the full window + aggregates (server watermark + run history).
6. Mid-slice failure: do **not** advance that day’s watermark; retry that slice next time.
7. Empty days still advance the watermark.
8. Manual and background sync share the same path.
9. `refreshStatus` merges watermarks with `max(local, server)` so an older server stamp cannot wipe local checkpoints.
10. While syncing, request a background task so the current day can finish after lock when iOS allows.

## Non-goals

- Client-side skip via server UUID inventory
- Shortening the 90-day first lookback
- Deletion sync

## Safety

Server upserts by `(owner, hk_uuid)`. Re-upload of already-synced samples updates in place; no duplicate rows. Interrupted pre-resume users with empty watermark re-scan 90 days once; upserts fill gaps without duplicating.
