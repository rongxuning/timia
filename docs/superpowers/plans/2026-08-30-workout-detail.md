# 运动记录详情 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从「近期训练」打开单次详情：地图与公里分段、3×3 摘要（即时跑力指数 + 约合瓦特、区间负荷）、TRIMP/rTSS、配速与跑步动力学曲线；基础信息同一行增加最大心率。

**Architecture:** 纯函数在 `workout_metrics.py` 算跑力/三种负荷/切段/降采样。新表 `health_workout_route` 存轨迹 JSONB；跑步动力学进现有 `health_sample_quantity`。`GET /views/me/health/workouts/{id}` 聚合会话、路线、时间窗样本。Web 详情套 `HealthPageFrame`；地图只用 MapLibre。

**Tech Stack:** FastAPI / SQLAlchemy 2 / Alembic / pytest；iOS HealthKit；Next.js / React / MapLibre GL；`make codegen` 同步 OpenAPI 类型。

**Spec:** `docs/superpowers/specs/2026-08-30-workout-detail-design.md`

## Global Constraints

- 用户可见文案一律简体中文；注明估算、非医疗。
- 缺数据用 `null` / 前端「—」，禁止用 0 冒充没戴表。
- 即时跑力仅 `activity_type == "running"`；宫格指数不改成瓦特，瓦特写在指数下方。
- 最大心率：用户填写优先，否则 Tanaka `208 − 0.7 × 年龄`，两者都空则跑力与三种负荷为 `null`。
- 曲线无序列则整块不渲染；路线没有则地图与分段不渲染。
- 不做课表、RQ 分析、补给、装备、心得、二维码。
- 不做 `codes/mobile/ios/Config/Debug.xcconfig` 的局域网 IP 提交。
- API 变更后 `make codegen`。

---

## File map

| File | Responsibility |
|------|----------------|
| `codes/core-service/app/services/workout_metrics.py` | 跑力、瓦特估算、五区负荷、Banister、rTSS、Haversine 切段、降采样、心率/配速区间 |
| `codes/core-service/tests/test_workout_metrics.py` | 上述纯函数单测 |
| `codes/core-service/app/models/health.py` | 新 metric 常量、`HealthWorkoutRoute`、会话海拔列、`HealthProfile.max_hr_bpm` |
| `codes/core-service/app/migrations/versions/0030_workout_detail.py` | 迁移 |
| `codes/core-service/app/schemas/health.py` | profile max HR、训练海拔、路线同步 DTO |
| `codes/core-service/app/schemas/views/health.py` | `HealthWorkoutDetailOut` 及子结构 |
| `codes/core-service/app/services/health_api.py` | profile / 训练海拔 / 路线 upsert；删除训练时删路线 |
| `codes/core-service/app/services/views/workout_detail.py` | 详情视图组装 |
| `codes/core-service/app/routes/health.py` | `POST /health/sync/workout-routes` |
| `codes/core-service/app/routes/views/health.py` | `GET /views/me/health/workouts/{workout_id}` |
| `codes/core-service/tests/test_health_api.py` | profile、路线、详情集成测 |
| `codes/mobile/ios/.../HealthPermissionManager.swift` | 跑步动力学读权限 |
| `codes/mobile/ios/.../HealthKitStore.swift` | 路线全轨迹、海拔 metadata、新 quantity |
| `codes/mobile/ios/.../HealthSyncAPI.swift` | 路线 payload 与 POST |
| `codes/mobile/ios/.../HealthSyncService.swift` | 训练之后同步路线 |
| `codes/web/src/components/health/HealthProfileForm.tsx` | 同一行最大心率 |
| `codes/web/src/lib/api/health-views.ts` | `fetchHealthWorkoutDetail` |
| `codes/web/app/(app)/my/health/workouts/[id]/page.tsx` | 详情页 |
| `codes/web/src/components/health/WorkoutDetail*.tsx` | 地图、宫格、分段、曲线 |
| `codes/web/src/components/health/MyHealthWorkouts.tsx` | 卡片可点 |
| `codes/web/src/components/Breadcrumbs.tsx` | 「训练详情」 |

---

### Task 1: 跑力与负荷纯函数（TDD）

**Files:**
- Create: `codes/core-service/app/services/workout_metrics.py`
- Test: `codes/core-service/tests/test_workout_metrics.py`

**Interfaces:**
- Produces:
  - `tanaka_hr_max(age_years: int | None) -> float | None`
  - `resolve_hr_max(*, profile_max: float | None, age_years: int | None) -> float | None`
  - `running_index(*, activity_type: str, duration_seconds: int, distance_m: float | None, avg_hr_bpm: float | None, hr_max: float | None, mean_grade: float | None = None) -> float | None`
  - `estimate_power_w(*, watch_power_w: float | None, mass_kg: float | None, distance_m: float | None, duration_seconds: int) -> float | None`
  - `zone_training_load(*, duration_seconds: int, avg_hr_bpm: float | None, hr_max: float | None, hr_rest: float | None, hr_series: list[tuple[float, float]] | None) -> float | None`
  - `banister_trimp(*, duration_seconds: int, avg_hr_bpm: float | None, hr_max: float | None, hr_rest: float | None, sex: str | None, hr_series: list[tuple[float, float]] | None) -> float | None`
  - `running_rtss(*, running_index_value: float | None, duration_seconds: int, pace_sec_per_km: float | None) -> float | None`
  - `haversine_m(lat1, lng1, lat2, lng2) -> float`
  - `km_splits(points: list[dict], hr_points: list[tuple[float, float]], cadence_points: list[tuple[float, float]]) -> list[dict]`
  - `downsample_series(points: list[tuple[float, float]], max_points: int = 600) -> list[tuple[float, float]]`
  - `hr_zones(...)` / `pace_zones(...)` → `list[dict]`（`zone, lo, hi, seconds, ratio`）
  - `RUNNING_INDEX_FORMULA` / `TRAINING_LOAD_FORMULA`：`HealthScoreFormulaOut`
  - `hr_series` 元素为 `(offset_seconds, bpm)`

- [ ] **Step 1: 写失败测试**

在 `codes/core-service/tests/test_workout_metrics.py`：

```python
from app.services.workout_metrics import (
    banister_trimp,
    estimate_power_w,
    haversine_m,
    km_splits,
    resolve_hr_max,
    running_index,
    running_rtss,
    tanaka_hr_max,
    zone_training_load,
)


def test_tanaka_and_resolve_hr_max():
    assert round(tanaka_hr_max(35), 1) == 183.5
    assert resolve_hr_max(profile_max=190, age_years=35) == 190
    assert resolve_hr_max(profile_max=None, age_years=35) == tanaka_hr_max(35)
    assert resolve_hr_max(profile_max=None, age_years=None) is None


def test_running_index_screenshot_order():
    value = running_index(
        activity_type="running",
        duration_seconds=35 * 60 + 8,
        distance_m=5010,
        avg_hr_bpm=161,
        hr_max=184,
    )
    assert value is not None
    assert 20 <= value <= 85
    assert 30 <= value <= 45


def test_running_index_rejects_short_or_walk():
    kwargs = dict(distance_m=5010, avg_hr_bpm=161, hr_max=184)
    assert running_index(activity_type="running", duration_seconds=11 * 60 + 59, **kwargs) is None
    assert running_index(activity_type="walking", duration_seconds=40 * 60, **kwargs) is None
    assert running_index(
        activity_type="running",
        duration_seconds=40 * 60,
        distance_m=5010,
        avg_hr_bpm=None,
        hr_max=184,
    ) is None


def test_zone_load_session_avg_and_missing_hr():
    load = zone_training_load(
        duration_seconds=35 * 60, avg_hr_bpm=161, hr_max=184, hr_rest=60, hr_series=None
    )
    assert load is not None and 0 < load <= 200
    assert (
        zone_training_load(
            duration_seconds=35 * 60, avg_hr_bpm=None, hr_max=184, hr_rest=60, hr_series=None
        )
        is None
    )


def test_banister_sex_coefficient_male_higher():
    common = dict(
        duration_seconds=35 * 60, avg_hr_bpm=161, hr_max=184, hr_rest=60, hr_series=None
    )
    male = banister_trimp(sex="male", **common)
    female = banister_trimp(sex="female", **common)
    assert male is not None and female is not None
    assert male > female


def test_rtss_none_without_index():
    assert running_rtss(running_index_value=None, duration_seconds=2108, pace_sec_per_km=421) is None
    value = running_rtss(running_index_value=34.0, duration_seconds=2108, pace_sec_per_km=421)
    assert value is not None and value > 0


def test_power_prefers_watch():
    assert (
        estimate_power_w(watch_power_w=240, mass_kg=70, distance_m=5010, duration_seconds=2108)
        == 240
    )
    est = estimate_power_w(
        watch_power_w=None, mass_kg=70, distance_m=5010, duration_seconds=2108
    )
    assert est is not None and 100 < est < 300


def test_km_splits_partial_last_lap():
    points = [
        {"t": float(i), "lat": i / 111_320, "lng": 0.0, "alt": None} for i in range(0, 2501, 10)
    ]
    splits = km_splits(points, hr_points=[], cadence_points=[])
    assert len(splits) == 3
    assert abs(splits[0]["distance_m"] - 1000) < 30
    assert abs(splits[-1]["distance_m"] - 500) < 30
    assert abs(haversine_m(0, 0, 1 / 111_320, 0) - 1) < 0.05
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd codes/core-service && PYTHONPATH=. uv run pytest tests/test_workout_metrics.py -v`

Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现 `workout_metrics.py`**

与 spec 对齐：

- `running_index`：`t = duration_seconds/60`；`d/t < 100` m/min 则 None；`RI0 = 213.9/t * (d/1000)**1.06 + 3.5`；`x = clamp(HR/HRmax*1.45 - 0.30, 0, 1)`；`x < 0.05` 则 None；结果 `clamp(RI0/x, 20, 85)` 一位小数。`mean_grade` 非空：ACSM `VO2 = 0.2v + 0.9v*grade + 3.5`，`v_eq = (VO2-3.5)/0.2`，用 `v_eq * t` 作为等效距离再算 `RI0`。
- `zone_training_load`：有序列则相邻点中点差为秒（首尾 5 秒），按 %HRR 或 %HRmax 落入权重 0.20/0.35/0.55/0.75/1.00；否则整场分钟 × 一区权重。夹到 0–200，一位小数。
- `banister_trimp`：`k` 男 1.92、女 1.67、否则 1.80；无 rest 时 `HRR = HR/HRmax`。
- `running_rtss`：跑力当 VDOT，目标耗氧 `0.88*index`，解 `0.000104 v^2 + 0.182258 v + (-4.60 - VO2) = 0` 取正根（m/min）；`P_T = 60000/v` 秒/公里；`IF = P_T/P_avg`；`rTSS = (t_min/60)*IF^2*100`。
- `estimate_power_w`：手表功率优先，否则 `1.06 * mass_kg * (distance_m/duration_seconds)`。
- `km_splits`：haversine 累加，每 1000 m 一圈，末圈保留；圈内 `t` 算用时；心率/步频对 `[t0,t1)` 平均。
- `downsample_series`：超 600 点则含首尾均匀取样。
- 两个 `HealthScoreFormulaOut` 常量，hint 用简体中文写有效条件与非医疗。

- [ ] **Step 4: 再跑测试**

Run: `cd codes/core-service && PYTHONPATH=. uv run pytest tests/test_workout_metrics.py -v`

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add codes/core-service/app/services/workout_metrics.py codes/core-service/tests/test_workout_metrics.py
git commit -m "$(cat <<'EOF'
Add workout running-index and training-load metrics.

EOF
)"
```

---

### Task 2: 迁移与模型

**Files:**
- Modify: `codes/core-service/app/models/health.py`
- Modify: `codes/core-service/app/models/__init__.py`
- Modify: `codes/core-service/app/migrations/env.py`（import `HealthWorkoutRoute`）
- Create: `codes/core-service/app/migrations/versions/0030_workout_detail.py`
- Modify: `codes/core-service/app/routes/dev_db_tables.py`

**Interfaces:**
- Produces: `METRIC_RUNNING_SPEED` 等五个常量进入 `QUANTITY_METRIC_TYPES`；`HealthProfile.max_hr_bpm`；会话海拔两列；`HealthWorkoutRoute(owner_user_id, workout_hk_uuid unique, points JSONB, point_count)`

- [ ] **Step 1: 写模型与迁移**

`revision = "0030_workout_detail"`，`down_revision = "0029_health_profile"`。

```python
op.add_column("health_profiles", sa.Column("max_hr_bpm", sa.Integer(), nullable=True))
op.add_column("health_workout_session", sa.Column("elevation_ascended_m", sa.Float(), nullable=True))
op.add_column("health_workout_session", sa.Column("elevation_descended_m", sa.Float(), nullable=True))
op.create_table(
    "health_workout_route",
    sa.Column("id", UUID(as_uuid=True), primary_key=True),
    sa.Column("owner_user_id", UUID(as_uuid=True), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
    sa.Column("workout_hk_uuid", UUID(as_uuid=True), nullable=False),
    sa.Column("points", postgresql.JSONB(), nullable=False),
    sa.Column("point_count", sa.Integer(), nullable=False),
    sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
    sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
    sa.UniqueConstraint("owner_user_id", "workout_hk_uuid", name="uq_health_workout_route_owner_hk"),
)
```

`points` 元素：`{"t": float, "lat": float, "lng": float, "alt": float | None}`。metric 名 ≤32 字符：`running_speed`、`running_stride`、`running_power`、`running_vertical_oscillation`、`running_ground_contact`。

- [ ] **Step 2: 升级**

Run: `cd codes/core-service && PYTHONPATH=. uv run python -m alembic upgrade head`

Expected: head `0030_workout_detail`

- [ ] **Step 3: Commit**

```bash
git add codes/core-service/app/models/health.py codes/core-service/app/models/__init__.py codes/core-service/app/migrations/versions/0030_workout_detail.py codes/core-service/app/migrations/env.py codes/core-service/app/routes/dev_db_tables.py
git commit -m "$(cat <<'EOF'
Add workout route table, elevation columns, and max heart rate.

EOF
)"
```

---

### Task 3: 基础信息最大心率 API

**Files:**
- Modify: `codes/core-service/app/schemas/health.py`（`HealthProfileIn`/`Out` 加 `max_hr_bpm`）
- Modify: `codes/core-service/app/schemas/views/health.py`（`HealthProfileViewOut`）
- Modify: `codes/core-service/app/services/health_api.py`
- Modify: `codes/core-service/app/services/views/my_health.py`
- Modify: `codes/core-service/tests/test_health_api.py`

**Interfaces:**
- Produces: PATCH `/health/profile` 与概览 `profile.max_hr_bpm`

- [ ] **Step 1: 测试**

Schema 不要 `ge=80`（避免 422）。在 `save_profile` 里：非空且不在 80–220 则 `HTTPException(400, detail="invalid_max_hr")`。

```python
def test_health_profile_max_hr_bpm():
    client = TestClient(app)
    _, token = _register_and_login(client)
    bad = client.patch("/health/profile", headers=_headers(token), json={"max_hr_bpm": 70})
    assert bad.status_code == 400
    assert bad.json()["detail"] == "invalid_max_hr"
    saved = client.patch("/health/profile", headers=_headers(token), json={"max_hr_bpm": 188})
    assert saved.status_code == 200
    assert saved.json()["max_hr_bpm"] == 188
    cleared = client.patch("/health/profile", headers=_headers(token), json={"max_hr_bpm": None})
    assert cleared.json()["max_hr_bpm"] is None
```

- [ ] **Step 2: 跑测失败 → 实现读写（`model_fields_set`）→ PASS**

Run: `cd codes/core-service && PYTHONPATH=. uv run pytest tests/test_health_api.py::test_health_profile_max_hr_bpm -v`

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
Persist max heart rate on the health profile.

EOF
)"
```

---

### Task 4: 训练海拔与动力学样本

**Files:**
- Modify: `codes/core-service/app/schemas/health.py`（`HealthWorkoutIn` 海拔两列）
- Modify: `codes/core-service/app/services/health_api.py`（`sync_workouts` upsert 海拔；`QUANTITY_METRIC_TYPES` 已含新类型）
- Modify: `codes/core-service/tests/test_health_api.py`

**Interfaces:**
- Produces: 训练海拔列；`running_power` 等 sample 可 upsert

- [ ] **Step 1: 测试** 同步 `running_speed` 样本 200；未知 `metric_type` 仍 400 `unknown_metric_type`；workout 带 `elevation_ascended_m: 12` 读回 12。

- [ ] **Step 2: 实现 → pytest PASS → commit**

```bash
git commit -m "$(cat <<'EOF'
Sync workout elevation and running dynamics samples.

EOF
)"
```

---

### Task 5: 路线同步 API

**Files:**
- Modify: `codes/core-service/app/schemas/health.py` 增加：

```python
class HealthRoutePointIn(BaseModel):
    t: float = Field(ge=0)
    lat: float
    lng: float
    alt: float | None = None

class HealthWorkoutRouteIn(BaseModel):
    hk_uuid: UUID
    points: list[HealthRoutePointIn] = Field(min_length=2, max_length=1800)

class HealthWorkoutRouteSyncIn(BaseModel):
    timezone: str = Field(default="Asia/Shanghai", min_length=1, max_length=64)
    routes: list[HealthWorkoutRouteIn] = Field(default_factory=list)
```

- Modify: `codes/core-service/app/services/health_api.py`：`sync_workout_routes`；`len(routes)>10` → `batch_too_large`；`len(points)>1800` → `too_many_points`；无未删除会话 → `workout_not_found`。删除 `DELETION_KIND_WORKOUT` 时软删对应 route（`deleted_at`）。
- Modify: `codes/core-service/app/routes/health.py`：`POST /health/sync/workout-routes`，`HealthSyncOut`。
- Test: `tests/test_health_api.py`

**Interfaces:**
- Produces: `POST /health/sync/workout-routes`

- [ ] **Step 1: 测试** 先 POST 训练再 POST 3 点路线 200；无训练 `workout_not_found`；11 条 `batch_too_large`。

- [ ] **Step 2: 实现 → PASS → commit**

```bash
git commit -m "$(cat <<'EOF'
Add HealthKit workout route sync endpoint.

EOF
)"
```

---

### Task 6: 训练详情视图 + codegen

**Files:**
- Modify: `codes/core-service/app/schemas/views/health.py`（`HealthWorkoutDetailOut` 及 `HealthOffsetPointOut`、`HealthSeriesWindowOut`、`HealthZoneShareOut`、`HealthRouteOut`、`HealthKmMarkerOut`、`HealthSplitOut`）
- Create: `codes/core-service/app/services/views/workout_detail.py` → `build_workout_detail(db, user, workout_id) -> HealthWorkoutDetailOut`，找不到 `ValueError("not_found")`
- Modify: `codes/core-service/app/routes/views/health.py`：`GET /health/workouts/{workout_id}`，404 `not_found`
- Modify: `codes/core-service/tests/test_health_api.py`
- 然后仓库根目录 `make codegen`；更新 `codes/web/src/types/api/views/health.ts` 增加 `HealthWorkoutDetail`

**Interfaces:**
- Consumes: Task 1 函数、`HealthWorkoutRoute`、quantity 样本
- Produces: `GET /views/me/health/workouts/{workout_id}`

详情 **不要** 改列表用的 `HealthWorkoutOut`。

组装：`hr_max_used = resolve_hr_max(...)`；`hr_rest_used` 近 14 天日汇总静息心率；体重近 14 天 `body_mass_kg`；窗内查 `heart_rate` 与五个 running_* 及 `step_count`；`offset_seconds` 相对 `start_at`；序列 `downsample_series` 600 点。配速优先 `running_speed`（m/s → 秒/公里），否则路线相邻点。`stride_m` 窗均或距离/(步频×分钟)。爬升：会话列否则路线 alt 上升和。`series` 键：`pace` `cadence` `stride` `power` `vertical_oscillation` `ground_contact` `altitude`，无点则 `null`。有跑力才返回 `running_index_formula`。

`HealthSplitOut`：`is_total: bool`，总计行 `is_total=True`。

- [ ] **Step 1: 集成测试** 注册用户、写 profile `max_hr_bpm`、sync running 训练 + 心率 + 路线 → GET 详情 `running_index` 非空、`splits` 含总计、他人 token 404。

- [ ] **Step 2: 实现视图 → pytest PASS**

- [ ] **Step 3: `make codegen` 并提交 OpenAPI 与 generated.ts**

```bash
git commit -m "$(cat <<'EOF'
Add personal workout detail view with metrics and route.

EOF
)"
```

---

### Task 7: iOS 路线与动力学

**Files:**
- `codes/mobile/ios/Timia/Core/Health/HealthPermissionManager.swift`
- `codes/mobile/ios/Timia/Core/Health/HealthKitStore.swift`
- `codes/mobile/ios/Timia/Core/API/HealthSyncAPI.swift`
- `codes/mobile/ios/Timia/Core/Health/HealthSyncService.swift`

**Interfaces:**
- Produces: 训练 payload 海拔；`POST /health/sync/workout-routes`；quantity 含 running_* 

权限增加 `runningStrideLength`、`runningPower`、`runningVerticalOscillation`、`runningGroundContactTime`。`quantitySpecs`：stride 米、power 瓦、VO 厘米×10 存 mm 或直接 mm、GCT 毫秒、speed m/s → `running_speed`。`workoutPayload` 读 `HKMetadataKeyElevationAscended` / `Descended`。`fetchRoute`：`HKWorkoutRouteQuery` 收齐点，`t = date - start`，均匀 ≤1800。`HealthSyncService`：训练批次成功后再传路线（每批 ≤10）。不要改 `Debug.xcconfig`。

JSON 字段随现有 `keyEncodingStrategy`（snake_case）命名，例如 `elevationAscendedM`。

- [ ] **Step 1: 改代码。** 真机/模拟器同步一条带 GPS 的跑步，确认服务端有 `health_workout_route`。

- [ ] **Step 2: Commit**

```bash
git commit -m "$(cat <<'EOF'
Export workout GPS routes and running dynamics from HealthKit.

EOF
)"
```

---

### Task 8: Web 基础信息同一行最大心率

**Files:**
- `codes/web/src/components/health/HealthProfileForm.tsx`
- `codes/web/src/hooks/useMyHealthPage.ts`
- `codes/web/src/lib/api/health-views.ts`
- `codes/web/src/lib/api-catalog.ts`

**Interfaces:**
- Consumes: `profile.max_hr_bpm`
- Produces: 一行保存四项

副标题：`用于推算消耗、跑力与负荷`。行 `flex flex-nowrap items-stretch gap-1`。最大心率与身高相同结构，单位「次」，`placeholder="心率"`，仅数字最多 3 位。空 → `null`。`onSave` 增加 `max_hr_bpm: number | null`。

- [ ] **Step 1: 改表单与 hook。**

- [ ] **Step 2: 浏览器 `/my/health`：** 男/女/年龄/身高/心率同一行不换行；保存刷新仍在。

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
Add max heart rate to the health profile row.

EOF
)"
```

---

### Task 9: Web 详情页壳与宫格

**Files:**
- Create: `codes/web/src/hooks/useHealthWorkoutDetail.ts`
- Modify: `codes/web/src/lib/api/health-views.ts` → `fetchHealthWorkoutDetail(token, id)`
- Create: `codes/web/app/(app)/my/health/workouts/[id]/page.tsx`（必须在 `[metric]` 之外，避免 `workouts` 被当成 metric）
- Create: `codes/web/src/components/health/WorkoutDetailSummary.tsx`
- Modify: `codes/web/src/components/health/MyHealthWorkouts.tsx` 与 `app/(app)/my/health/page.tsx`（传 `queryString`，卡片点击 `/my/health/workouts/${id}`）
- Modify: `codes/web/src/components/Breadcrumbs.tsx`：`health` 下 `workouts` 跳过或不当成卡片；其下 uuid 显示「训练详情」
- Modify: `codes/web/src/lib/api-catalog.ts`

**Interfaces:**
- Consumes: `GET /views/me/health/workouts/{id}`
- Produces: 详情页（地图曲线可先占位不渲染）

宫格按 spec §3。跑力/负荷「？」用 API formula。下方 `TRIMP n · rTSS n`。时长 `hh:mm:ss`。404：「找不到这条训练」。占位分析：「将根据该次训练的原始数据生成观察与建议，稍后接入。」套 `HealthPageFrame`。

- [ ] **Step 1: 实现路由与宫格、列表可点。**

- [ ] **Step 2: 浏览器点训练卡片进入详情，返回保留 query。**

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
Add workout detail page with summary metrics.

EOF
)"
```

---

### Task 10: 地图与分段表

**Files:**
- Create: `codes/web/src/components/health/WorkoutRouteMap.tsx`
- Create: `codes/web/src/components/health/WorkoutSplitsTable.tsx`
- Modify: `codes/web/package.json`（`maplibre-gl`）
- Modify: 详情页

**Interfaces:**
- Consumes: `detail.route`、`detail.splits`

- [ ] **Step 1:** `cd codes/web && npm install maplibre-gl`

- [ ] **Step 2: 地图** `import maplibregl from "maplibre-gl"` 与 CSS。容器 `h-64`。`style`：`process.env.NEXT_PUBLIC_MAP_STYLE_URL` 或 OSM raster JSON。`LineString` 为 `[lng,lat]`；按段配速上色（快 `#22c55e`，慢 `#64748b`）。起点/终点/`km_markers` 用 Marker。`fitBounds`；卸载 `map.remove()`。无 route 不渲染。

- [ ] **Step 3: 表** 列：圈数、时间、距离公里两位、平均配速、平均心率、平均步频。`is_total` 行文案「总计」。无 splits 不渲染。

- [ ] **Step 4: 浏览器核对有/无路线两种状态。Commit（含 lockfile）**

```bash
git commit -m "$(cat <<'EOF'
Render workout GPS map and kilometre splits.

EOF
)"
```

---

### Task 11: 心率与动力学曲线

**Files:**
- Create: `codes/web/src/components/health/WorkoutSeriesChart.tsx`
- Create: `codes/web/src/components/health/WorkoutZoneBar.tsx`
- Modify: 详情页

**Interfaces:**
- Consumes: `heart_rate`、`heart_rate_zones`、`series.*`、`pace_zones`

顺序：配速、配速区间、心率、心率区间、步频、步幅、功率、垂直振幅、触地时间、海拔。`null` 跳过整块。配速 Y 轴越上越快，标签 `m'ss"`。折线 1px + `vector-effect="non-scaling-stroke"`，轴用 HTML `text-caption`，无评分色带。海拔标题旁总爬升/总下降。

- [ ] **Step 1: 实现组件并接入。**

- [ ] **Step 2: 浏览器滚动详情，有样本出图、无样本不占空卡片。**

- [ ] **Step 3: Commit**

```bash
git commit -m "$(cat <<'EOF'
Add workout pace, heart-rate, and running-dynamics charts.

EOF
)"
```

---

## 自检（对照 spec）

| Spec | Task |
|------|------|
| §1 入口/结构 | 9 |
| §2 最大心率同一行 | 3, 8 |
| §3 宫格与瓦特 | 1, 6, 9 |
| §4–6 跑力与三种负荷 | 1, 6 |
| §7 路线、地图、分段 | 2, 5, 7, 10 |
| §8 曲线与 HK 类型 | 4, 7, 11 |
| §9 API / codegen | 6 |
| §10 Web | 8–11 |
| §11 不做五项 | 不实现 |
| 删除训练清路线 | 5 |
| iOS 先训练后路线 | 7 |
