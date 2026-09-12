# 健康数据 / 训练记录 拆分同步改造方案

**Date:** 2026-09-12  
**Status:** 方案（绿场可直接拆），待实现  
**Depends on:** [health-data-and-sync](../../technical-solution/health-data-and-sync.md)、[health-domain](./2026-08-27-health-domain-design.md)、[workout-detail](./2026-08-30-workout-detail-design.md)  
**Supersedes:** [2026-09-10-health-sync-replan](./2026-09-10-health-sync-replan-design.md) 的混合管线 / 展示优先排队 / 单一水位。健康侧「upsert 不算日表 + 脏日期 rollup」并进本文，不再另开一条客户端编排。

## 前提

**当前没有用户同步过数据。** 服务端健康表、`health_sync_state`、`health_sync_run`、iOS 混合 outbox / 旧水位都可以按新模型直接改，不必：

- 把 `last_synced_at` 复制到两列
- 保留兼容字段或默认推断 `pipeline`
- 升级时拆旧 outbox 行
- 双写旧客户端协议

实现 = 删混合代码 + 写两套管线，不是迁移。

## Goal

两条互不抢水位、互不传重叠样本的同步：

1. **健康数据** — 全日数量样本、睡眠、站立、心跳序列。按日切片 + outbox。
2. **训练记录** — `HKWorkout` 信封 + 摘要标量 + 路线。按场次直传，**不要训练 outbox**。

训练路径不上传心率曲线、跑步动力学、步数序列。iOS 同步机制和同步页重做。**`/my/health` 展示页不改。**

可验收：

1. 账号两入口，各管各的水位 / 失败重试。
2. 只同步训练：列表、信封、地图有；曲线为空（现有空态）。
3. 再同步健康：同一场按时间窗切出曲线，无第二份心率、无重复 `hk_uuid`。
4. 只同步健康：日卡片有；训练列表空。
5. 推健康水位不影响训练水位，反之亦然。

---

## 0. 相对上一稿收紧了什么

| 上一稿 | 这一稿 |
|--------|--------|
| 兼容列 `last_synced_at` = max(两路) | **删列**，API 只返回两个水位 |
| `pipeline` 可缺省推断 | **必填** `health` \| `workout` |
| 旧水位复制到两列 / 强制全量开关 | **无迁移** |
| 训练也做 SQLite outbox | 训练 **GET 已同步 uuid 再 diff**，失败重跑即可（幂等） |
| 健康 samples 再拆 P1/P2/P3 | **不拆**。训练已离队，心率不再堵训练 |
| 升级清旧队列当兼容策略 | 直接删混合文件 |

09-10 里「为了训练先亮而给心率排队」整段作废。

---

## 1. 硬约束

### 1.1 Web

不改 `codes/web` 下 `/my/health` 的页面、组件、视图路由。不改 `GET /views/me/health*` 响应形状。不加「汇总中」文案。

随 OpenAPI 更新的 **不是展示页**：`generated.ts`、`api-catalog.ts`、站内库表目录 `database-domains.ts`。`/health/sync-status` 本来就没有页面在用。

### 1.2 重叠禁令

同一物理事实只允许一种写入。

| 数据 | 只允许 | 禁止 |
|------|--------|------|
| `health_workout_session` / `_route` | 训练同步 | 健康导出或 POST 训练端点 |
| `health_sample_quantity` 全部 metric（含心率、跑步动力学、步数） | 健康同步 | 训练 POST `/sync/samples` |
| 睡眠 / 站立 / 心跳序列 | 健康同步 | 训练带这些类别 |
| `kind=workout` 删除 | 训练同步 | 健康 deletions 混入 |
| 样本类删除 | 健康同步 | 训练 deletions 混入 |

**允许、不算重叠：** 训练把 `avg_hr_bpm` / `max_hr_bpm` / `avg_cadence_spm` / 配速 / 距离 / 消耗 / 海拔写在 session 行上。来源是 `HKWorkout.statistics` 或一场内 `HKStatisticsQuery`，**只读 HealthKit，不传点序列**。

Web 详情继续按 `[start_at, end_at]` 切 `WINDOW_METRIC_TYPES`。日表只吃样本，不吃 workout 行。

**禁止：** 训练心率表、训练路径另一套 UUID 存心率、训练请求夹带窗口内心率。

### 1.3 直接删掉的混合客户端

不要在旧类型上加 `pipeline` flag。整文件换掉：

- `HealthKitExport` 一把梭
- `HealthSyncQueue` / `HealthSyncDrain` 里的路线等训练、Group 波次
- `timia.health.lastSyncedAt` 与 `applyServerWatermark` 单水位
- `HealthSyncView`
- Observer 用同一个水位决定两路能不能跑

启动时若仍看到旧 outbox 文件 / 旧 UserDefaults key：**删除**，不要读。

---

## 2. 产品：iOS 两页

```
健康与健身
  健康数据     → HealthDataSyncView
  训练记录     → WorkoutSyncView
```

HealthKit **一次授权**（`readTypes` 保持全集）。任一页 `requestIfNeeded()`。

### 2.1 健康数据页

不再出现训练行。

- 授权 / 系统设置
- 同步、上次健康同步、失败 + 重试
- 本管线队列计数、清空健康队列
- 待同步：按日的指标 / 睡眠 / 站立 / 心跳条数
- 已同步：`pipeline=health` 的 run
- **重新同步时间段**（默认近 7 天，上限 90 天）：只覆盖健康样本，不改训练水位，不清库

进度：`健康 · 第 12/90 天 · 2026-06-20`。

### 2.2 训练记录页

按场次，对标活动列表。

- 同步全部（近 90 天 HK 有、服务端还没有的）
- 上次训练同步
- 待同步：一场一行（类型、时间、时长、距离），可「同步这场」
- 已同步：HK 与服务端 uuid 交集；行上「重新上传」只重打该场 session + 路线
- **没有**按日重传心率

进度：`训练 · 3/14 · 跑步 5.2 km`。

待同步数据源：本机 90 天 `HKWorkout` **减去** `GET /health/sync/workout-uuids` 返回的 uuid。不要再维护本地 Ack 集合（那是第四轨）。Web 清除后 uuid 接口变空，列表自动回到待同步。

### 2.3 清除

Web 清除仍硬删样本 + 训练 + 日表 + **整行** `health_sync_state`。iOS 拉到两水位都空：清健康锚点/队列 + 训练锚点。两页回到首次 90 天。

锁屏 / 屏幕通知改成两路状态（iOS，不是 Web）。

---

## 3. 架构

```
                    HealthKit（同一 store）
                     /                    \
                    /                      \
         exportHealth / anchored     exportWorkouts / anchored
         数量/睡眠/站立/心跳         HKWorkout + 路线
                    |                      |
         HealthOutbox (SQLite)      无 outbox
         按日 enqueue + drain        GET uuid → diff → POST
                    |                      |
         samples/sleep/stand/        workouts + workout-routes
         heartbeat + health删除      + workout删除
         checkpoint(health)          checkpoint(workout)
                    |                      |
         last_health_synced_at       last_workout_synced_at
                    |
              脏日期 → health_rollup job
                    |
              Web GET /views/me/health*（页面不改）
```

- 两套断点、两套后台预算。禁止再加「总进度」。
- 健康热路径只 upsert + 标脏；checkpoint / finishRun **不算日表**。
- 训练 upsert 不标脏、不算日表。

---

## 4. 客户端

### 4.1 文件

| 现状 | 改造后 |
|------|--------|
| `exportSamples` / `exportAnchoredChanges` → `HealthKitExport` | `exportHealth` / `exportHealthAnchored`；`exportWorkouts` / `exportWorkoutAnchored` |
| `anchorKeys` 全集 | `healthAnchorKeys` / `workoutAnchorKeys`（`workout`） |
| 一个 Queue + Drain | **只有健康** Outbox + Drain。训练无队列文件 |
| `HealthSyncService` | `HealthSyncService` + `WorkoutSyncService` |
| `HealthSyncView` | `HealthDataSyncView` + `WorkoutSyncView` |
| 一个 Observer 列表 | 按 type 分流到对应 service |
| `HealthSyncAPI` | 两个水位；checkpoint/runs 带 `pipeline`；新 `GET workout-uuids` |

gzip、`(owner, hk_uuid)` 幂等、健康批大小（500 提到 1000）沿用。

### 4.2 健康（按日 + outbox）

导出 **禁止** `fetchWorkouts`。类别保持现在的 samples / sleep / standHours / heartbeats / deletions，**不要**再拆 samples 优先级。

```text
runHealthSync(window, source, skipGlobalCheckpoint=false):
  for slice in daySlices(window):
    export = store.exportHealth(slice)
    healthOutbox.enqueue(export)
    drain until day empty
    if not skipGlobalCheckpoint:
      checkpoint(to: slice.end, pipeline: health)
  finishRun(pipeline: health)
```

增量：只读健康锚点。坏了用 2 天窗修复，不碰训练。

| 健康水位 | 健康 outbox | Observer / 短唤醒 |
|----------|-------------|-------------------|
| 空，队列空 | 空 | return，不开 90 天 |
| 空，队列非空 | 有 | 只 drain |
| 已有 | — | 锚点增量 → 预算 drain（约 8 批 / 20s） |

健康页点首次：`BGProcessingTask` 只跑健康日循环。

时间段重传：`skipGlobalCheckpoint=true`，upsert 覆盖 + 标脏。

### 4.3 训练（按场次，直传）

90 天场次通常几十条，失败重跑便宜，upsert 幂等。不引入训练 SQLite。

```text
runWorkoutSync(source, onlyHkUuid?=nil, skipGlobalCheckpoint=false):
  local = store.workouts(from: now-90d, to: now)   # 或锚点增量得到的新场
  remote = GET /health/sync/workout-uuids?from&to
  pending = onlyHkUuid ? [that] : local.hkUuid not in remote
  for chunk in pending.chunked(20):
    POST /sync/workouts { workouts: envelopes }    # 无 samples
    routes = store.routes(for: chunk)
    if routes: POST /sync/workout-routes
  if anchored deletions: POST /sync/deletions kind=workout
  if not skipGlobalCheckpoint:
    checkpoint(to: now, pipeline: workout)
  finishRun(pipeline: workout)
```

- 信封仍是现有 `HealthWorkoutPayload`。标量用 statistics，**不**把窗口内心率 / 步数 / `running_*` 编进 body。
- 先 session 再该场 route（服务端仍 `400 workout_not_found`）。
- HealthKit 删训练只同步 `kind=workout`；公共样本池里的点不动。
- 单场重传：`onlyHkUuid` + `skipGlobalCheckpoint`，POST 覆盖。
- 水位空时 Observer **不开** 90 天倒货；用户点过一次之后走锚点增量直 POST。
- 不需要按日 checkpoint。一场失败继续下一场；整轮失败下次 diff 接着传。

增量：`exportWorkoutAnchored` 得到新场 / 删除 → 直接 POST。不必每次 GET 全量 uuid。首次和「同步全部 / 对账」才打 uuid 接口。

### 4.4 后台

Observer 拆开：

- 健康：数量 / 睡眠 / 站立 / 心跳（去掉 `workoutType`）
- 训练：`HKObjectType.workoutType()`（路线随训练读）

两路预算分开，避免心率 drain 吃掉训练的 20 秒。

---

## 5. 服务端

### 5.1 表：直接改，不留兼容列

`health_sync_state`：

| 列 | 说明 |
|----|------|
| `last_health_synced_at` | 健康已确认到 |
| `last_workout_synced_at` | 训练已确认到 |
| `last_health_run_id` / `last_workout_run_id` | 可选，便于两页各指最近一次 |
| ~~`last_synced_at`~~ | **删除** |
| ~~`last_run_id`~~ | **删除**（或拆成上面两列） |

空库无行可迁。Alembic：`drop_column last_synced_at, last_run_id` + add 新列。测试全部改读新字段。

`health_sync_run.pipeline`：`health` | `workout`，**NOT NULL**。表空，直接加列。

### 5.2 API

| 方法 | 变更 |
|------|------|
| upsert 七个路径 | body **不变**。训练端点不收样本字段 |
| `POST /health/sync/checkpoint` | body **必填** `pipeline`；只推进对应列；**不算日表**；响应 `{ last_health_synced_at, last_workout_synced_at }` |
| `POST /health/sync/runs` | **必填** `pipeline`；只记账；success 可推对应水位；**不算日表** |
| `GET /health/sync-status` | 去掉 `last_synced_at`；返回两个水位。`?pipeline=` 过滤 `runs`；`days` 在 `pipeline=health` 时不算 `workout_count`，`pipeline=workout` 时只出有训练的日或直接空（训练页主要用 uuid 接口） |
| **新** `GET /health/sync/workout-uuids?from&to` | `{ hk_uuids: string[] }`，未删 session。给训练页 diff。N 小，不做分页 |
| **新** `POST /health/sync/rollup` | 可选，健康重传后立刻算 ≤3 天；其余 cron |
| `DELETE /health/data` | 删 state 行（两水位一起没）。响应形状可保持 |

缺 `pipeline` → `400 missing_pipeline`。不要推断。

脏表 `health_metrics_dirty(owner, local_date, timezone)`：只在 quantity / sleep / stand / heartbeat upsert 后写入。workout **不写**。

`python -m app.jobs.health_rollup`：cron 每分钟，每次最多约 20 个脏日期，按日升序。成功再删脏行。重算按 metric 分别 SQL 聚合（09-10 §5.4），禁止再 `SELECT` 三天窗全部 quantity 进 ORM。

### 5.3 不改的读路径

- `build_workout_detail` 仍切窗口样本
- 列表仍读 session 摘要
- 卡片仍读 `health_metrics_daily`
- `hr_series` 为空时的公式降级保持原样

---

## 6. 用户能看到的组合

| 操作 | 训练列表 / 信封 / 地图 | 训练曲线 | 现状卡片 |
|------|------------------------|----------|----------|
| 未同步 | 空 | 空 | 空 |
| 只同步训练 | 有 | 空 | 空 |
| 只同步健康 | 空 | 无训练可进 | 有（rollup 后） |
| 两路都同步 | 有 | 有 | 有 |
| Web 清除 | 空 | 空 | 空；两水位空 |

不是 Web 新 UI。

---

## 7. 实现顺序

Web 健康页始终零 diff。codegen / api-catalog / database-domains 随 API 改。

1. **服务端表 + API**  
   换水位列、`pipeline` 必填、checkpoint/runs 去掉重算、uuid 接口、脏表 + rollup job。改 `test_health_api.py`（旧 `last_synced_at` 断言全部换掉）。

2. **iOS 导出拆开**  
   训练 export 不含 quantity；健康 export 不含 workout/route。

3. **健康 Outbox + HealthSyncService**  
   删混合 Queue 里的 workouts/routes 与「路线等待」。旧 sqlite 文件名作废。

4. **WorkoutSyncService 直传**  
   无第二套 outbox。uuid diff + 按场 POST。

5. **两页 + 账号入口**  
   删 `HealthSyncView`。

6. **后台分流 + 锁屏文案**

每步可独立测。不要留「旧水位 fallback」。

---

## 8. 明确不做

- 改 `/my/health` 页面
- 训练上传心率 / 跑步动力学 / 步数点，或训练曲线表
- 训练 SQLite outbox、本地 Ack 第四轨
- 健康 samples 再拆 P1/P2/P3
- 保留 `last_synced_at` / 缺省 pipeline / 旧 outbox 升级路径
- Android / Health Connect
- 缩短 90 天（健康 = 90 个本地日；训练 = 90 天场次）
- 日表改以客户端 `HKStatisticsQuery` 为真相
- 七个 upsert 合成大包、Celery、protobuf
- Web 发起重传

---

## 9. 实现时打开这些文件

客户端（重写 / 拆分）：

- `Features/Account/AccountView.swift`
- `Features/Health/HealthSyncView.swift` → 两页替换
- `Core/Health/HealthKitStore.swift`
- `Core/Health/HealthSyncService.swift` / `HealthSyncQueue.swift` / `HealthSyncDrain.swift` / `HealthBackgroundDelivery.swift`
- `Core/API/HealthSyncAPI.swift`
- `Core/ScreenNotification/ScreenNotificationContentBuilder.swift`
- `TimiaTests/HealthSyncQueueTests.swift`

服务端：

- `app/models/health.py` — `HealthSyncState` / `HealthSyncRun`
- `app/routes/health.py`、`app/schemas/health.py`、`app/services/health_api.py`
- 新 Alembic、`app/jobs/health_rollup.py`
- `app/services/views/workout_detail.py` — **只读确认，不改**

Web 展示：`codes/web/src/components/health/*` — **不改**。
