# Health Sync Performance & Background Drain Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make 90-day first sync materially faster and make incremental health sync progress reliably in the background via gzip, deferred daily recompute, partial indexes, a durable outbox, HK anchors, and budgeted drains.

**Architecture:** Keep server watermark + day checkpoints. Defer daily recompute to checkpoint/finish-run. Add gzip request bodies. On iOS, enqueue HealthKit exports into SQLite outbox and drain with a shared scheduler (aggressive in foreground, budgeted in background). Later phases add HKQueryAnchor incremental export and safe cross-category parallelism.

**Tech Stack:** FastAPI + Starlette middleware + SQLAlchemy/Alembic/Postgres; SwiftUI iOS + HealthKit + SQLite (GRDB or raw SQLite3).

**Spec:** [docs/superpowers/specs/2026-09-05-health-sync-performance-design.md](../specs/2026-09-05-health-sync-performance-design.md)

## Global Constraints

- Do not shorten the 90-day first lookback.
- Do not add Android / Health Connect in this plan.
- Do not add client skip via server UUID inventory.
- Preserve `(owner_user_id, hk_uuid)` upsert idempotency.
- First sync (server watermark / `last_synced_at` nil) remains **foreground-only**.
- After Task 5+: checkpoint a local day only when that day is exported **and** outbox has no pending rows for that `local_date`.
- Keep existing JSON field names (`hk_uuid`, `metric_type`, `start_at`, `upserted`, `local_dates`, `to_at`).
- Server tests: `cd codes/core-service && uv run pytest -q` (or `uv run pytest tests/test_health_api.py -q`).
- Lint: `cd codes/core-service && uv run ruff check .`

## File map

| File | Responsibility |
|------|----------------|
| `codes/core-service/app/middleware/gzip_request.py` | Decompress `Content-Encoding: gzip` request bodies |
| `codes/core-service/app/main.py` | Register gzip middleware |
| `codes/core-service/app/services/health_api.py` | Move recompute off sync batches onto checkpoint/finish |
| `codes/core-service/app/migrations/versions/0032_health_partial_indexes.py` | Partial indexes `WHERE deleted_at IS NULL` |
| `codes/core-service/app/models/health.py` | Mirror new indexes in `__table_args__` |
| `codes/core-service/tests/test_health_api.py` | Gzip + deferred recompute tests |
| `codes/mobile/ios/Timia/Core/API/APIClient.swift` | Optional gzip encode + per-request timeout |
| `codes/mobile/ios/Timia/Core/API/HealthSyncAPI.swift` | Use gzip + 60s timeout on sync POSTs |
| `codes/mobile/ios/Timia/Core/Health/HealthSyncQueue.swift` | SQLite outbox (new) |
| `codes/mobile/ios/Timia/Core/Health/HealthSyncDrain.swift` | Unified upload drain (new) |
| `codes/mobile/ios/Timia/Core/Health/HealthKitAnchorStore.swift` | Persist `HKQueryAnchor` per type (new) |
| `codes/mobile/ios/Timia/Core/Health/HealthSyncService.swift` | Orchestrate export → enqueue → drain → checkpoint |
| `codes/mobile/ios/Timia/Core/Health/HealthBackgroundDelivery.swift` | Budgeted drain; keep nil-watermark gate |
| `codes/mobile/ios/Timia/Core/Health/HealthKitStore.swift` | Anchored queries + deletion export |
| `codes/mobile/ios/Timia/Features/Health/HealthSyncView.swift` | Shared drain; keep `beginBackgroundTask` |

---

### Task 1: Server gzip request middleware

**Files:**
- Create: `codes/core-service/app/middleware/__init__.py`
- Create: `codes/core-service/app/middleware/gzip_request.py`
- Modify: `codes/core-service/app/main.py`
- Modify: `codes/core-service/tests/test_health_api.py`

**Interfaces:**
- Consumes: Starlette `Request`, raw body bytes
- Produces: Requests with decompressed JSON body when `Content-Encoding: gzip`; `400` + `content_encoding_invalid` on bad gzip

- [ ] **Step 1: Write failing tests for gzip + plain + corrupt**

Append to `codes/core-service/tests/test_health_api.py` (helpers `_headers` / `_register_and_login` already exist; add `import gzip` at top if missing):

```python
def test_health_sync_samples_accepts_gzip_body():
    client = TestClient(app)
    _, token = _register_and_login(client)
    now = datetime.now(timezone.utc).isoformat()
    payload = {
        "timezone": "Asia/Shanghai",
        "samples": [
            {
                "hk_uuid": str(uuid.uuid4()),
                "metric_type": "step_count",
                "start_at": now,
                "end_at": now,
                "value": 100,
                "unit": "count",
            }
        ],
    }
    compressed = gzip.compress(json.dumps(payload).encode("utf-8"))
    resp = client.post(
        "/health/sync/samples",
        headers={
            **_headers(token),
            "Content-Type": "application/json",
            "Content-Encoding": "gzip",
        },
        content=compressed,
    )
    assert resp.status_code == 200, resp.text
    assert resp.json()["upserted"] == 1


def test_health_sync_samples_rejects_bad_gzip():
    client = TestClient(app)
    _, token = _register_and_login(client)
    resp = client.post(
        "/health/sync/samples",
        headers={
            **_headers(token),
            "Content-Type": "application/json",
            "Content-Encoding": "gzip",
        },
        content=b"not-gzip",
    )
    assert resp.status_code == 400
    assert resp.json()["detail"] == "content_encoding_invalid"
```

- [ ] **Step 2: Run tests — expect FAIL (no middleware)**

Run: `cd codes/core-service && uv run pytest tests/test_health_api.py::test_health_sync_samples_accepts_gzip_body tests/test_health_api.py::test_health_sync_samples_rejects_bad_gzip -q`

Expected: FAIL (JSON parse error or 400/500 without `content_encoding_invalid`).

- [ ] **Step 3: Implement middleware**

`codes/core-service/app/middleware/gzip_request.py`:

```python
"""Decompress gzip-encoded request bodies before route handlers run."""

from __future__ import annotations

import gzip

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response


class GzipRequestMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        encoding = (request.headers.get("content-encoding") or "").lower().strip()
        if encoding != "gzip":
            return await call_next(request)

        body = await request.body()
        try:
            decompressed = gzip.decompress(body)
        except OSError:
            return JSONResponse(status_code=400, content={"detail": "content_encoding_invalid"})

        async def receive() -> dict:
            return {"type": "http.request", "body": decompressed, "more_body": False}

        request = Request(request.scope, receive)
        return await call_next(request)
```

Empty `__init__.py` in the same package.

In `main.py`, register **before** CORS so the body is readable (order: last-added runs first in Starlette — add gzip **after** CORS so gzip runs first on the way in):

```python
from app.middleware.gzip_request import GzipRequestMiddleware

# existing CORS add_middleware...
app.add_middleware(GzipRequestMiddleware)
```

- [ ] **Step 4: Run gzip tests — expect PASS**

Run: `cd codes/core-service && uv run pytest tests/test_health_api.py::test_health_sync_samples_accepts_gzip_body tests/test_health_api.py::test_health_sync_samples_rejects_bad_gzip tests/test_health_api.py::test_quantity_upsert_is_idempotent_and_rolls_daily -q`

Expected: PASS (plain JSON path still works).

- [ ] **Step 5: Commit**

```bash
git add codes/core-service/app/middleware codes/core-service/app/main.py codes/core-service/tests/test_health_api.py
git commit -m "feat(health): accept gzip-encoded sync request bodies"
```

---

### Task 2: Defer daily recompute to checkpoint / finish-run

**Why:** Within one HTTP request, `dates` is already a `set`. The real waste is **many batches for the same local day**, each calling `recompute_daily_metrics`. Client already checkpoints once per day and finishes a run at the end — move recompute there.

**Files:**
- Modify: `codes/core-service/app/services/health_api.py`
- Modify: `codes/core-service/tests/test_health_api.py`

**Interfaces:**
- Consumes: sync batch payloads (unchanged); checkpoint `to_at`; finish-run `local_dates` / window
- Produces: sync endpoints upsert only; `advance_sync_checkpoint` + successful `record_sync_run` recompute affected local dates

- [ ] **Step 1: Write failing test — sync alone does not roll daily until checkpoint**

Mirror `test_quantity_upsert_is_idempotent_and_rolls_daily`, which already uses `GET /views/me/health` → `current.steps`:

```python
def test_daily_metrics_recompute_on_checkpoint_not_each_batch():
    client = TestClient(app)
    _, token = _register_and_login(client)
    start = datetime.now(timezone.utc).isoformat()
    payload = {
        "timezone": "Asia/Shanghai",
        "samples": [
            {
                "hk_uuid": str(uuid.uuid4()),
                "metric_type": "step_count",
                "start_at": start,
                "end_at": start,
                "value": 500,
                "unit": "count",
            }
        ],
    }
    synced = client.post("/health/sync/samples", headers=_headers(token), json=payload)
    assert synced.status_code == 200, synced.text
    assert synced.json()["upserted"] == 1

    before = client.get("/views/me/health", headers=_headers(token))
    assert before.status_code == 200, before.text
    assert before.json()["current"]["steps"] in (None, 0)

    cp = client.post(
        "/health/sync/checkpoint",
        headers=_headers(token),
        json={"to_at": start, "timezone": "Asia/Shanghai"},
    )
    assert cp.status_code == 200, cp.text

    after = client.get("/views/me/health", headers=_headers(token))
    assert after.status_code == 200, after.text
    assert after.json()["current"]["steps"] == 500
```

- [ ] **Step 2: Run test — expect FAIL (metrics already present after sync)**

Run: `cd codes/core-service && uv run pytest tests/test_health_api.py::test_daily_metrics_recompute_on_checkpoint_not_each_batch -q`

- [ ] **Step 3: Implement deferred recompute**

In `codes/core-service/app/services/health_api.py`:

1. Add helper:

```python
def _recompute_dates(
    db: Session, owner_user_id: uuid.UUID, dates: set[date], timezone_name: str
) -> None:
    for local_date in sorted(dates):
        recompute_daily_metrics(db, owner_user_id, local_date, timezone_name)
```

2. Remove every `recompute_daily_metrics(...)` call from:
   - `sync_quantity_samples`
   - `sync_sleep_samples`
   - `sync_stand_hours`
   - `sync_heartbeat_series`
   - `sync_workouts`
   - `sync_deletions`  
   Keep returning `local_dates` unchanged. (`sync_workout_routes` currently does not recompute — leave as-is.)

3. Extend `HealthSyncCheckpointIn` with optional timezone:

```python
class HealthSyncCheckpointIn(BaseModel):
    to_at: datetime
    timezone: str = Field(default="Asia/Shanghai", min_length=1, max_length=64)
```

4. In `advance_sync_checkpoint`, after advancing watermark, recompute `local_date_of(to_at)` and the previous calendar day:

```python
to_at = _aware(payload.to_at)
tz_name = _ensure_timezone(payload.timezone)
d0 = local_date_of(to_at, tz_name)
_recompute_dates(db, user.id, {d0, d0 - timedelta(days=1)}, tz_name)
```

(Use the file’s existing timezone/date helpers — names may be `_ensure_timezone` / `local_date_of` / equivalent.)

5. In `record_sync_run`, when `payload.status == "success"`, recompute each date in `payload.local_dates` (ISO `YYYY-MM-DD`). If empty, derive the inclusive local-date span from `from_at`/`to_at` using payload timezone if you add one, else `"Asia/Shanghai"`.

6. Update iOS `HealthSyncAPI.checkpoint` to send `timezone` alongside `to_at` (already available on `HealthSyncService.timezone`).

- [ ] **Step 4: Fix tests that assumed sync-batch updates daily immediately**

Run: `cd codes/core-service && uv run pytest tests/test_health_api.py -q`

Any test that asserts `current.steps` (or other rolled metrics) immediately after `/health/sync/samples` must either:
- `POST /health/sync/checkpoint` first, or
- `POST /health/sync/runs` with `status=success` and the relevant `local_dates`.

Start with `test_quantity_upsert_is_idempotent_and_rolls_daily` and any other `assert ...["steps"]` right after sync.

- [ ] **Step 5: Commit**

```bash
git add codes/core-service/app/services/health_api.py codes/core-service/app/schemas/health.py codes/core-service/tests/test_health_api.py
git commit -m "perf(health): defer daily recompute to checkpoint and finish-run"
```

---

### Task 3: Partial indexes for non-deleted samples

**Files:**
- Create: `codes/core-service/app/migrations/versions/0032_health_partial_indexes.py`
- Modify: `codes/core-service/app/models/health.py` (document indexes in `__table_args__`)

**Interfaces:**
- Consumes: existing tables with `deleted_at`
- Produces: partial indexes used by sync/read queries filtering `deleted_at IS NULL`

- [ ] **Step 1: Add migration**

```python
"""partial indexes for active health samples

Revision ID: 0032_health_partial_indexes
Revises: 0031_health_sync_runs
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0032_health_partial_indexes"
down_revision = "0031_health_sync_runs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Table/column names must match app/models/health.py
    op.create_index(
        "ix_health_sample_quantity_owner_type_start_alive",
        "health_sample_quantity",
        ["owner_user_id", "metric_type", "start_at"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "ix_health_sample_quantity_owner_start_alive",
        "health_sample_quantity",
        ["owner_user_id", "start_at"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "ix_health_sample_sleep_owner_start_alive",
        "health_sample_sleep",
        ["owner_user_id", "start_at"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "ix_health_sample_stand_hour_owner_start_alive",
        "health_sample_stand_hour",
        ["owner_user_id", "start_at"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "ix_health_series_heartbeat_owner_start_alive",
        "health_series_heartbeat",
        ["owner_user_id", "start_at"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "ix_health_workout_session_owner_start_alive",
        "health_workout_session",
        ["owner_user_id", "start_at"],
        postgresql_where=sa.text("deleted_at IS NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_health_workout_session_owner_start_alive", table_name="health_workout_session")
    op.drop_index("ix_health_series_heartbeat_owner_start_alive", table_name="health_series_heartbeat")
    op.drop_index("ix_health_sample_stand_hour_owner_start_alive", table_name="health_sample_stand_hour")
    op.drop_index("ix_health_sample_sleep_owner_start_alive", table_name="health_sample_sleep")
    op.drop_index("ix_health_sample_quantity_owner_start_alive", table_name="health_sample_quantity")
    op.drop_index("ix_health_sample_quantity_owner_type_start_alive", table_name="health_sample_quantity")
```

- [ ] **Step 2: Mirror indexes on ORM models**

Add matching `Index(..., postgresql_where=text("deleted_at IS NULL"))` entries alongside existing indexes (do **not** drop old indexes in this task).

- [ ] **Step 3: Upgrade + regression tests**

```bash
cd codes/core-service && uv run alembic upgrade head
cd codes/core-service && uv run pytest tests/test_health_api.py -q
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add codes/core-service/app/migrations/versions/0032_health_partial_indexes.py codes/core-service/app/models/health.py
git commit -m "perf(health): add partial indexes for non-deleted samples"
```

---

### Task 4: iOS gzip bodies + 60s sync timeout

**Files:**
- Modify: `codes/mobile/ios/Timia/Core/API/APIClient.swift`
- Modify: `codes/mobile/ios/Timia/Core/API/HealthSyncAPI.swift`

**Interfaces:**
- Consumes: `Encodable` body
- Produces: POST with `Content-Encoding: gzip` when `compress: true`; `timeoutInterval` override (60 for health sync)

- [ ] **Step 1: Extend `APIClient.request` signature**

Current signature uses `method` / `authenticated` / `response`. Extend it — do not rename existing params:

```swift
func request<Response: Decodable & Sendable>(
    _ path: String,
    method: String = "GET",
    query: [URLQueryItem] = [],
    body: (any Encodable & Sendable)? = nil,
    authenticated: Bool = true,
    compress: Bool = false,
    timeoutInterval: TimeInterval? = nil,
    response: Response.Type = Response.self
) async throws -> Response {
    ...
    request.timeoutInterval = timeoutInterval ?? 30
    if let body {
        let json = try Self.encoder.encode(AnyEncodable(body))
        if compress {
            request.httpBody = try Self.gzipCompress(json)
            request.setValue("gzip", forHTTPHeaderField: "Content-Encoding")
        } else {
            request.httpBody = json
        }
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
    }
    ...
}
```

Add `Data+Gzip.swift` (or private helper on `APIClient`) using Apple `Compression` with a gzip wrapper — keep dependency-free.

- [ ] **Step 2: Health sync POSTs use compress + 60s**

In `HealthSyncAPI.swift`, update every sync POST (`/health/sync/samples`, `sleep`, `stand-hours`, `workouts`, `workout-routes`, `heartbeat-series`, later `deletions`):

```swift
try await client.request(
    "/health/sync/samples",
    method: "POST",
    body: payload,
    compress: true,
    timeoutInterval: 60,
    response: HealthSyncOut.self
)
```

Leave `GET /health/sync-status` uncompressed.

- [ ] **Step 3: Manual smoke**

Against a local API with Task 1 deployed: run one manual sync; confirm server logs show successful upserts. Optionally log `json.count` vs gzip size in DEBUG.

- [ ] **Step 4: Commit**

```bash
git add codes/mobile/ios/Timia/Core/API/APIClient.swift codes/mobile/ios/Timia/Core/API/HealthSyncAPI.swift codes/mobile/ios/Timia/Core/API/Data+Gzip.swift
git commit -m "perf(ios): gzip health sync bodies and raise timeout to 60s"
```

Note: Xcode project may need the new Swift file added if the target does not use folder references.

---

### Task 5: SQLite outbox (`HealthSyncQueue`)

**Files:**
- Create: `codes/mobile/ios/Timia/Core/Health/HealthSyncQueue.swift`
- Modify: Xcode project membership if files are explicitly listed (or ensure folder sync picks it up)

**Interfaces:**
- Consumes: category enum + JSON `Data` + `localDate: String`
- Produces: durable pending rows; ACK delete; pending count; pending-by-date queries

- [ ] **Step 1: Define queue API**

```swift
import Foundation
import SQLite3

enum HealthSyncOutboxCategory: String, Sendable {
    case samples, sleep, standHours, workouts, routes, heartbeats, deletions
}

struct HealthSyncOutboxRow: Sendable, Identifiable {
    var id: Int64
    var category: HealthSyncOutboxCategory
    var localDate: String
    var payload: Data
    var attempts: Int
    var status: String // pending | uploading | failed
}

actor HealthSyncQueue {
    static let shared = HealthSyncQueue()

    func enqueue(category: HealthSyncOutboxCategory, localDate: String, payload: Data) throws
    func nextPending(limit: Int) throws -> [HealthSyncOutboxRow]
    func markUploading(ids: [Int64]) throws
    func acknowledge(ids: [Int64]) throws
    func markFailed(id: Int64, attempts: Int) throws
    func pendingCount() throws -> Int
    func pendingCount(localDate: String) throws -> Int
    func clearAll() throws
}
```

Store DB under Application Support: `timia.health.outbox.sqlite`.

Schema:

```sql
CREATE TABLE IF NOT EXISTS outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,
  local_date TEXT NOT NULL,
  payload BLOB NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_outbox_status_id ON outbox(status, id);
CREATE INDEX IF NOT EXISTS ix_outbox_local_date ON outbox(local_date, status);
```

- [ ] **Step 2: Unit-testable pure logic (optional host test)**

If the iOS test target can run: enqueue → nextPending → acknowledge → pendingCount == 0. Otherwise verify with a small `#if DEBUG` self-check called from a debug menu once.

- [ ] **Step 3: Commit**

```bash
git add codes/mobile/ios/Timia/Core/Health/HealthSyncQueue.swift
git commit -m "feat(ios): add SQLite health sync outbox"
```

---

### Task 6: Unified drain + wire first-sync through outbox

**Files:**
- Create: `codes/mobile/ios/Timia/Core/Health/HealthSyncDrain.swift`
- Modify: `codes/mobile/ios/Timia/Core/Health/HealthSyncService.swift`
- Modify: `codes/mobile/ios/Timia/Features/Health/HealthSyncView.swift`
- Modify: `codes/mobile/ios/Timia/Core/Health/HealthBackgroundDelivery.swift`

**Interfaces:**
- Consumes: `HealthSyncQueue`, `HealthSyncAPI`, drain budget
- Produces: uploaded batches; checkpoint only when `pendingCount(localDate) == 0` after that day’s export finished

- [ ] **Step 1: Implement drain**

```swift
struct HealthSyncDrainBudget: Sendable {
    var maxBatches: Int
    var maxDuration: TimeInterval

    static let foreground = HealthSyncDrainBudget(maxBatches: .max, maxDuration: .infinity)
    static let background = HealthSyncDrainBudget(maxBatches: 8, maxDuration: 20)
}

@MainActor
struct HealthSyncDrain {
    var api: HealthSyncAPI
    var queue: HealthSyncQueue = .shared

    /// Returns number of batches uploaded. Stops when budget hit or queue empty.
    func drain(budget: HealthSyncDrainBudget, onProgress: ((String) -> Void)? = nil) async throws -> Int
}
```

Drain rules:
1. Pull up to `uploadConcurrency` (4) **same-category** pending rows (keep workouts before routes globally: never upload `routes` while any `workouts` pending with earlier id / same or earlier local_date).
2. POST via existing `HealthSyncAPI` methods (decode payload Data back to the right Encodable type — store typed envelopes in enqueue).
3. On success `acknowledge`; on transport/5xx `markFailed` + requeue as pending with attempts++.
4. Stop when `uploaded >= maxBatches` or elapsed >= `maxDuration`.

Enqueue envelope suggestion:

```swift
struct HealthSyncOutboxEnvelope: Codable {
    var category: String
    var timezone: String
    // exactly one of:
    var samples: HealthQuantitySyncPayload?
    var sleep: HealthSleepSyncPayload?
    // ...
}
```

Or store already-encoded API payload JSON plus category discriminator (simpler for drain switch).

- [ ] **Step 2: Change `syncWindow` flow**

Per day slice:
1. `exportSamples` as today
2. Chunk + **enqueue** all category batches for that `localDate` (do not HTTP yet)
3. `drain(budget: .foreground)` until that day’s pending count is 0 (or throw)
4. `checkpoint(toAt:)` only after step 3
5. After all days: `finishRun` as today
6. On clear-data path: `HealthSyncQueue.shared.clearAll()`

- [ ] **Step 3: Background delivery uses budgeted drain**

Replace full `syncWindow` in `HealthBackgroundDelivery.handleUpdate` with:

```swift
guard watermark != nil else { return } // keep first-sync gate
var taskId: UIBackgroundTaskIdentifier = .invalid
taskId = UIApplication.shared.beginBackgroundTask(withName: "health-sync-bg") {
    // cancel cooperative flag if you add one
}
defer {
    if taskId != .invalid { UIApplication.shared.endBackgroundTask(taskId) }
}
// Phase 3 will export via anchors into queue; until then:
// export a short recent window (e.g. last 2 days) into outbox, then:
let uploaded = try await HealthSyncDrain(api: syncAPI).drain(budget: .background)
_ = uploaded
```

Until Task 7 (anchors), background may still time-export a **short** lookback (max 2 days) into the outbox — never the full 90-day window.

- [ ] **Step 4: Manual verification checklist**

- Kill app mid-day sync → relaunch → pending outbox drains without re-exporting completed days’ checkpoints.
- Background wake with watermark set → pending decreases.
- Nil watermark → background no-ops.

- [ ] **Step 5: Commit**

```bash
git add codes/mobile/ios/Timia/Core/Health/HealthSyncDrain.swift codes/mobile/ios/Timia/Core/Health/HealthSyncService.swift codes/mobile/ios/Timia/Core/Health/HealthBackgroundDelivery.swift codes/mobile/ios/Timia/Features/Health/HealthSyncView.swift
git commit -m "feat(ios): durable outbox drain for manual and background health sync"
```

---

### Task 7: HKQueryAnchor incremental export + drop fixed 2h overlap

**Files:**
- Create: `codes/mobile/ios/Timia/Core/Health/HealthKitAnchorStore.swift`
- Modify: `codes/mobile/ios/Timia/Core/Health/HealthKitStore.swift`
- Modify: `codes/mobile/ios/Timia/Core/Health/HealthSyncService.swift`
- Modify: `codes/mobile/ios/Timia/Core/Health/HealthBackgroundDelivery.swift`

**Interfaces:**
- Consumes: `HKQueryAnchor?` per sample type key
- Produces: delta samples + new anchors; clear-all resets anchors

- [ ] **Step 1: Anchor store**

```swift
actor HealthKitAnchorStore {
    static let shared = HealthKitAnchorStore()
    func load(key: String) -> HKQueryAnchor?
    func save(key: String, anchor: HKQueryAnchor)
    func clearAll()
}
```

Persist `anchor.withSafeEncode()` Data in UserDefaults or the outbox SQLite DB table `anchors(key TEXT PRIMARY KEY, blob BLOB)`.

- [ ] **Step 2: Anchored export API on `HealthKitStore`**

```swift
func exportAnchoredChanges() async throws -> (export: HealthKitExport, newAnchors: [String: HKQueryAnchor])
```

Use `HKAnchoredObjectQuery` (or async equivalent) per observed type. Include deleted objects list for Task 8.

- [ ] **Step 3: Wire sync modes**

- **First sync** (watermark nil): keep day time-window export; after successful full window + finishRun, write anchors from a final anchored query (or from empty→full anchors captured at end).
- **Incremental** (watermark present): `exportAnchoredChanges` → enqueue → drain; **do not** apply `overlap` (2h) when anchors exist.
- On anchor load failure: delete that key; heal with `startDate = now - 2 days` time window once; then save fresh anchors.
- Clear-data: `anchorStore.clearAll()` + `queue.clearAll()` + `clearLastSyncedAt()` (server watermark already nil).

- [ ] **Step 4: Background path**

`handleUpdate` → anchored export → enqueue → `drain(budget: .background)` only.

- [ ] **Step 5: Commit**

```bash
git add codes/mobile/ios/Timia/Core/Health/HealthKitAnchorStore.swift codes/mobile/ios/Timia/Core/Health/HealthKitStore.swift codes/mobile/ios/Timia/Core/Health/HealthSyncService.swift codes/mobile/ios/Timia/Core/Health/HealthBackgroundDelivery.swift
git commit -m "feat(ios): HKQueryAnchor incremental health export"
```

---

### Task 8: Client deletion sync

**Files:**
- Modify: `codes/mobile/ios/Timia/Core/API/HealthSyncAPI.swift`
- Modify: `codes/mobile/ios/Timia/Core/Health/HealthKitStore.swift`
- Modify: `codes/mobile/ios/Timia/Core/Health/HealthSyncDrain.swift`
- Modify: `codes/mobile/ios/Timia/Core/Health/HealthSyncQueue.swift` (category already includes `deletions`)

**Interfaces:**
- Consumes: deleted HK UUIDs + kind from anchored query deleted objects
- Produces: `POST /health/sync/deletions` batches (max 500)

- [ ] **Step 1: API method**

```swift
func syncDeletions(_ payload: HealthDeletionSyncPayload) async throws -> HealthSyncOut {
    try await client.request(
        "/health/sync/deletions",
        method: "POST",
        body: payload,
        compress: true,
        timeoutInterval: 60,
        response: HealthSyncOut.self
    )
}
```

Match server schema field names (`hk_uuid`, `kind`, `timezone`).

- [ ] **Step 2: Enqueue deletions from anchored export**

Map HK object type → server `kind` enum used by `DELETION_KINDS` in `models/health.py`.

- [ ] **Step 3: Drain handles `.deletions`**

Upload deletions **before** or **with** samples for the same wake (order: deletions first is safer so upserts do not resurrect soft-deleted rows incorrectly — follow server semantics).

- [ ] **Step 4: Add/adjust server regression if missing**

Ensure `tests/test_health_api.py` covers deletions soft-delete + daily recompute via checkpoint.

- [ ] **Step 5: Commit**

```bash
git add codes/mobile/ios/Timia/Core/API/HealthSyncAPI.swift codes/mobile/ios/Timia/Core/Health
git commit -m "feat(ios): upload HealthKit deletions during sync drain"
```

---

### Task 9: Cross-category parallel upload + day prefetch (Phase 4)

**Files:**
- Modify: `codes/mobile/ios/Timia/Core/Health/HealthSyncDrain.swift`
- Modify: `codes/mobile/ios/Timia/Core/Health/HealthSyncService.swift`

**Interfaces:**
- Consumes: pending rows across categories
- Produces: parallel upload for `{samples, sleep, standHours, heartbeats}`; serial `workouts` then `routes`; foreground prefetch of day N+1 while draining day N

- [ ] **Step 1: Parallel groups in drain**

```swift
// Group A (parallel): samples, sleep, standHours, heartbeats
// Group B: workouts (wait for A optional — independent OK)
// Group C: routes (must wait for workouts for same local_date)
```

Use a task group with concurrency cap 4–6 **within** an allowed parallel set.

- [ ] **Step 2: Prefetch pipeline in `syncWindow`**

While draining day N’s outbox, start `exportSamples` for day N+1 into memory/outbox without checkpointing N+1 early.

- [ ] **Step 3: Optional quantity batch bump**

If gzip + 60s stable: raise client chunk size for samples toward 800 and server `BATCH_SAMPLES_MAX` to 800 in the same PR (keep tests updated for `batch_too_large`).

- [ ] **Step 4: Commit**

```bash
git add codes/mobile/ios/Timia/Core/Health codes/core-service/app/services/health_api.py codes/core-service/tests/test_health_api.py
git commit -m "perf(health): parallel category drain and day prefetch pipeline"
```

---

### Task 10: Telemetry hooks (minimum)

**Files:**
- Modify: iOS drain/sync service (os.Logger or existing analytics helper)
- Modify: `health_api.py` (structured log counters)

- [ ] **Step 1: Log fields**

Client (debug/info): `export_ms`, `upload_ms`, `batch_bytes`, `gzip_ratio`, `outbox_pending`, `drain_batches`, `bg_budget_hit`.

Server: log `recompute_count` per checkpoint/finish-run request.

- [ ] **Step 2: Commit**

```bash
git commit -am "chore(health): add sync performance telemetry fields"
```

---

## Self-review vs spec

| Spec item | Task |
|-----------|------|
| Gzip compression | Task 1 + 4 |
| Recompute coalesce / defer | Task 2 |
| Partial indexes | Task 3 |
| 60s timeout | Task 4 |
| SQLite outbox | Task 5 |
| Budgeted background drain + beginBackgroundTask | Task 6 |
| First-sync foreground gate | Task 6 (preserved) |
| HK anchors + drop 2h overlap | Task 7 |
| Client deletions | Task 8 |
| Cross-category parallel + prefetch | Task 9 |
| Telemetry | Task 10 |
| Clear-data resets anchors/outbox | Tasks 5–7 |

No TBD placeholders. Checkpoint timezone optional field called out explicitly in Task 2.

## Suggested execution split

If running with multiple agents or PRs, merge in order **Task 1→2→3→4** (P1), then **5→6** (P2 background gate), then **7→8** (P3), then **9→10** (P4). Do not start Task 7 until Task 6 is green on a device.
