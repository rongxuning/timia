# 健康数据 / 训练记录 拆分同步改造方案

**Date:** 2026-09-12  
**Status:** 方案，待实现  
**Depends on:** [health-data-and-sync](../../technical-solution/health-data-and-sync.md)、[health-domain](./2026-08-27-health-domain-design.md)、[workout-detail](./2026-08-30-workout-detail-design.md)  
**Supersedes (客户端编排):** [2026-09-10-health-sync-replan](./2026-09-10-health-sync-replan-design.md) 的「一条混合同步管线 + 展示优先排队」。服务端瘦上传 / 脏日期 rollup 仍可沿用，但不再依赖「训练和心率挤在同一条 outbox」。

## Goal

把现在「健康与健身」这一条混合管线拆成两条互不抢水位、互不传重叠样本的同步：

1. **健康数据同步** — 全日数量样本、睡眠、站立、心跳序列。
2. **训练记录同步** — `HKWorkout` 信封 + 摘要标量 + 路线。

训练路径 **不上传** 心率曲线、跑步动力学、步数序列等会和健康路径重叠的样本。iOS 同步机制可以推倒重做，同步页重做。**Web 页面与视图接口不改。**

可验收结果：

1. 账号页有两个入口；各管各的授权后同步、水位、待传/已传、失败重试。
2. 只同步训练：Web 训练列表、详情信封、地图立刻可用；心率/配速/步频曲线为空（现有空态，不改页面）。
3. 再同步健康：同一条训练详情按时间窗切出曲线，不出现第二份心率、不出现重复 `hk_uuid`。
4. 只同步健康：现状卡片 / 日汇总有数据；训练列表仍空，直到训练同步跑过。
5. 一条管线的成功 **不会** 把另一条的水位推过去，导致另一条以为 90 天已经传完。

---

## 0. 为什么必须拆

### 0.1 现在是一条管线

现状（`HealthKitStore.exportSamples` / `exportAnchoredChanges` → `HealthSyncQueue` → `HealthSyncDrain` → 一个 `health_sync_state.last_synced_at`）：

- 按日切片一次导出 **全部类型**（数量 + 睡眠 + 站立 + 训练 + 路线 + 心跳）。
- 一个 SQLite outbox，drain 波次还要照顾「路线等训练」「心率别堵训练」。
- 一个服务端水位。训练传完把水位推到今天，健康样本等于被标成「已同步」。
- iOS 只有一页 `HealthSyncView`（账号 →「健康数据」）。

这就是首次同步又慢、又难续、又难单独重传一场训练的根因。RQ / Strava / HealthFit 一类产品是 **按场次同步训练**，全日心率走另一条（或根本不传）。

### 0.2 服务端其实已经分端点

HTTP 已经分开，重叠发生在 **客户端编排和单一水位**，不是表结构：

| 训练该打的 | 健康该打的 |
|------------|------------|
| `POST /health/sync/workouts` | `POST /health/sync/samples` |
| `POST /health/sync/workout-routes` | `POST /health/sync/sleep` |
| `kind=workout` 的 deletions | `POST /health/sync/stand-hours` |
| | `POST /health/sync/heartbeat-series` |
| | `kind∈{quantity,sleep,stand_hour,heartbeat_series}` 的 deletions |

Web 训练详情的曲线本来就不是训练上传带上去的，而是 `workout_detail.build_workout_detail` 按 `[start_at, end_at]` 去切 `health_sample_quantity`（`WINDOW_METRIC_TYPES`：心率、跑步速度/步幅/功率/垂直振幅/触地、步数）。拆上传之后这条读路径 **原样保留**。

### 0.3 和 09-10 重规划的关系

09-10 选定「瘦上传 + 脏日期 rollup + 展示优先排队」，但仍是 **一条队列里给训练插队**。拆开之后：

| 09-10 仍要 | 09-10 作废 |
|------------|------------|
| upsert 热路径不算日表 | 把 `samples` 再拆 P1/P2/P3 优先级 |
| 脏日期 + `health_rollup` job | 混合 `HealthKitExport` + 混合 drain 波次 |
| 健康侧按日切片、outbox、三轨进度 | 「训练和心率挤同一条管线」 |
| 健康侧时间段重传、BGProcessing 跑 90 天 | 为了让训练先亮而在健康队列里插队 |

训练侧改成「列出近 90 天 `HKWorkout` → 按场次/小批量上传信封 + 路线」，不再按日倒全日心率。

---

## 1. 硬约束

### 1.1 Web 不改

- 不改 `codes/web` 任何页面、组件、路由。
- 不改 `GET /views/me/health*` 的响应形状（包括训练详情里的 `heart_rate` / 跑步序列空态）。
- 不为了拆分去加 `rollup_pending_days` 或改卡片文案。
- `GET /health/sync-status` 的旧字段 `last_synced_at` **保留**：取两条水位的较新者（或任一非空）。Web 生成类型 / api-catalog 不用动；Web 页面本来也不画同步页。

同步相关的 additive 字段（`last_health_synced_at`、`last_workout_synced_at`、`pipeline`）只给 iOS 用。OpenAPI 变更后照常 `make codegen`，前端多出来的字段忽略即可。

### 1.2 重叠禁令（存库层）

同一物理事实只允许一种写入方式。

| 数据 | 只允许谁写 | 禁止 |
|------|------------|------|
| `health_workout_session` | 训练同步 | 健康同步碰训练 / 路线端点 |
| `health_workout_route` | 训练同步 | 健康同步上传路线 |
| `health_sample_quantity` 全部 `metric_type`（含 `heart_rate`、跑步动力学、步数） | 健康同步 | 训练同步 POST `/sync/samples` |
| 睡眠 / 站立 / 心跳序列 | 健康同步 | 训练同步带这些类别 |
| 训练删除 `kind=workout` | 训练同步 | 健康 deletions 混入 workout |
| 样本类删除 | 健康同步 | 训练 deletions 混入 quantity/sleep/… |

**允许、且不算重叠：**

- 训练上传把 **摘要标量** 写在 session 行上：`avg_hr_bpm` / `max_hr_bpm` / `avg_cadence_spm` / `avg_pace_sec_per_km` / 距离 / 消耗 / 海拔。这些来自 `HKWorkout.statistics` 或一场内的 `HKStatisticsQuery`，**只读 HealthKit，不把点序列打到 `/sync/samples`**。
- Web 详情用健康样本池切曲线；信封用 session 标量。两套展示，一套样本真相。
- 日汇总 `health_metrics_daily` 只吃数量 / 睡眠 / 站立样本，不吃 workout 行（现状如此，保持）。

**禁止再做的事：**

- 新建 `health_workout_heart_rate` 或训练专属曲线表。
- 训练同步用另一套 UUID 再存一份心率（会和健康路径双写）。
- 为了「训练详情立刻有曲线」而在训练路径夹带窗口内心率。

### 1.3 可以推倒的客户端

下列现状视为技术债，实现时直接换掉，不必兼容旧 outbox 行格式：

- `HealthKitExport` 一把梭（samples+sleep+stand+workouts+routes+heartbeats+deletions）
- 单一 `HealthSyncQueue` / `HealthSyncDrain` 波次（含路线等训练）
- 单一 `timia.health.lastSyncedAt` + 单一 `applyServerWatermark`
- 单一 `HealthSyncView` + 账号单一入口
- Observer 用同一个 `last_synced_at` 决定「能不能后台跑」

升级策略：新版本启动时清空旧混合 outbox、旧混合水位缓存；服务端两条新水位从旧 `last_synced_at` **复制过去**（见 §5.3）。用户各点一次同步即可，不做旧队列拆行。

---

## 2. 产品：iOS 两页

账号 `AccountView` section「健康与健身」改成两行，不再进混合页。

```
健康与健身
  健康数据     → HealthDataSyncView
  训练记录     → WorkoutSyncView
```

HealthKit 授权仍是 **一次对话框**（`HealthPermissionManager.readTypes` 可保持全集）。任一页都可以 `requestIfNeeded()`。不要求用户在两页各授权一次。

### 2.1 健康数据页

重做，不再出现训练列表、不再上传训练。

保留并收干净：

- 授权 / 去系统设置
- 同步、上次同步、失败摘要 + 重试
- 本地队列计数、清空本管线队列
- 待同步：按日的指标 / 睡眠 / 站立 / 心跳条数（无训练行）
- 已同步：只展示 `pipeline=health` 的 run
- **重新同步时间段**（默认近 7 天，上限 90 天）：只覆盖健康样本，不改训练水位，不清库

进度文案示例：`健康 · 第 12/90 天 · 2026-06-20 · 指标上传中`。

### 2.2 训练记录页

按场次，不按日倒全日样本。对标「活动列表 + 同步 / 重传这一场」。

- 授权（若尚未）
- 同步全部（近 90 天尚未 ACK 的训练 + 其路线）
- 上次训练同步时间
- **待同步**：一场一行（类型、开始时间、时长、距离）；可点「同步这场」
- **已同步**：来自本机对照（已有 session 的 `hk_uuid`）或最近 `pipeline=workout` 的 run
- 已同步行保留「重新上传」：只重打该 `hk_uuid` 的 session + 路线，**不**重打心率点
- 不提供「按日期重传全日心率」——那是健康页的事

进度文案示例：`训练 · 3/14 · 跑步 5.2 km`。90 天训练量通常几十场，不必日切片。

### 2.3 清除数据

Web「清除健康数据」行为不变（硬删样本 + 训练 + 日表 + 两条水位）。iOS 下次拉 `sync-status` 看到两条水位都空，清掉 **两套** 本地状态（健康锚点/队列 + 训练锚点/已同步 uuid 集合）。两页都回到「点同步走 90 天」。

锁屏 Live Activity / 屏幕通知：现文案「健康数据同步」改成能表示两路（例如「健康未同步 · 训练 昨天」），这是 iOS 端，不是 Web。

---

## 3. 架构

```
                    HealthKit（同一 store）
                     /                    \
                    /                      \
         HealthKitHealthExport      HealthKitWorkoutExport
         数量/睡眠/站立/心跳         HKWorkout + 路线
         + 对应 deletions            + workout deletions
                    |                      |
         HealthOutbox (SQLite)    WorkoutOutbox (SQLite)
                    |                      |
         HealthSyncService        WorkoutSyncService
         按日切片 / 锚点增量         按场次列表 / 锚点增量
                    |                      |
         /sync/samples,sleep,…    /sync/workouts, workout-routes
         /sync/deletions(health)  /sync/deletions(workout)
         checkpoint(pipeline=health)  checkpoint(pipeline=workout)
                    |                      |
         last_health_synced_at    last_workout_synced_at
                    \                      /
                     \                    /
                  日表 rollup job      （不读 workout 行）
                              |
                    Web GET /views/me/health*
                    （页面不改；曲线仍切公共样本池）
```

原则：

- **两条服务、两套断点、两套后台预算。** 禁止再引入「总进度」第四轨。
- 热路径仍然只 upsert。日表仍不在训练 HTTP 里算；健康侧沿用 09-10 的脏日期 job（实现可与拆分同一期或紧随其后）。
- 训练成功不标健康脏日期（训练行不进日表）。健康 upsert 才标脏。

---

## 4. 客户端改造（推倒重做）

### 4.1 文件怎么拆

现有混合文件可以删或缩成薄封装，不要在旧类型上继续叠 flag。

| 现状 | 改造后 |
|------|--------|
| `HealthKitStore.exportSamples` / `exportAnchoredChanges` 返回 `HealthKitExport` | `exportHealth(...)` / `exportHealthAnchored(...)` 与 `exportWorkouts(...)` / `exportWorkoutAnchored(...)` |
| `HealthKitStore.anchorKeys` 全集 | `healthAnchorKeys` 与 `workoutAnchorKeys`（`workout` + 如有独立 route 查询则 route） |
| `HealthSyncQueue` 多 category | `HealthOutbox`：samples / sleep / standHours / heartbeats / deletions；`WorkoutOutbox`：workouts / routes / deletions |
| `HealthSyncDrain` Group A + 路线等训练 | 两个 drain；健康可并行 samples∥sleep∥stand∥heartbeats；训练必须 session ACK 后再打该场 route |
| `HealthSyncService` | `HealthSyncService`（只健康）+ `WorkoutSyncService` |
| `HealthSyncView` | `HealthDataSyncView` + `WorkoutSyncView` |
| `HealthBackgroundDelivery` 一个 observer 列表 | 拆成两类 type，回调进对应 service；或一个类里按 type 分流 |
| `HealthSyncAPI` | 增加 `pipeline`；status 解码两个水位。upsert URL 不变 |

`HealthPermissionManager`、gzip、`(owner, hk_uuid)` 幂等、数量批大小，健康侧可继续沿用。

### 4.2 健康同步（保留日切片）

与 09-10 §4 相同，但 **导出函数不再调用 `fetchWorkouts`**：

```text
runHealthSync(window, source):
  for slice in daySlices(window):
    export = store.exportHealth(slice)          # 无 workouts/routes
    healthOutbox.enqueue(export)
    drain health until day empty
    checkpoint(to: slice.end, pipeline: health) # 重传窗 skipGlobal
  finishRun(pipeline: health)
```

增量：只读 `healthAnchorKeys`。锚点坏则 2 天窗修复，仍不碰训练。

后台：

| 健康水位 | 健康 outbox | Observer |
|----------|-------------|----------|
| 空，队列空 | 空 | return（不在短唤醒开 90 天） |
| 空，队列非空 | 有 | 只 drain |
| 已有 | — | 锚点增量 → 预算 drain |

用户在健康页点了首次同步：提交 `BGProcessingTask`，只跑健康日循环。

### 4.3 训练同步（按场次）

```text
runWorkoutSync(source, onlyHkUuid? = nil):
  workouts = store.workouts(from: now-90d, to: now)   # 或锚点增量
  if onlyHkUuid: filter
  pending = workouts whose hk_uuid not in localAcked
             or onlyHkUuid (重传)
  for chunk in pending.chunked(size: 20):             # 一场也不夹带样本
    POST /sync/workouts { workouts: envelopes }
    for w in chunk:
      if route = store.route(w): POST /sync/workout-routes
    localAcked.insert(uuids)
  checkpoint(to: now, pipeline: workout)              # 单场重传 skipGlobal
  finishRun(pipeline: workout)
```

要点：

- **信封字段保持现有 `HealthWorkoutPayload`。** `avgHrBpm` / `maxHrBpm` / `avgCadenceSpm` 继续用 statistics / 窗口聚合算标量，**不要**把窗口内 `heart_rate` / `stepCount` / `running_*` 样本编进 payload。
- 路线仍要求服务端已有该 `workout_hk_uuid`（现 `400 workout_not_found`）。按场次先 session 再 route，混合队列里的「路线等更早训练」约束可以扔掉。
- 删除：只同步 `kind=workout`。HealthKit 删一场训练，健康样本仍留在公共池（和 Apple 模型一致：关联是指针，点还在）。
- 首次 90 天：场次数小，前台一次或 `BGProcessingTask` 都能跑完；Observer 在训练水位为空时同样 **不开** 90 天倒货。
- 本地 `localAcked`：UserDefaults / SQLite 存已 ACK 的 `hk_uuid`。Web 清除后随训练水位清空。单场重传不删全局 Ack，只强制再 POST 该 uuid（幂等覆盖）。

不需要为训练做按日 checkpoint。一场失败不影响其它场。

### 4.4 后台分流

`HealthBackgroundDelivery.observerTypes` 拆开：

- 健康：现有数量 / 睡眠 / 站立 / 心跳（可去掉 `HKObjectType.workoutType()`）
- 训练：`HKObjectType.workoutType()`，必要时 `HKSeriesType.workoutRoute()`

短唤醒预算仍约 8 批 / 20s，但 **两路分开记账**，避免心率 drain 吃掉训练的 20 秒。

---

## 5. 服务端（页面不改，水位必须拆）

### 5.1 表

`health_sync_state` 现一列 `last_synced_at`。加两列：

| 列 | 含义 |
|----|------|
| `last_health_synced_at` | 健康管线已确认到的时间 |
| `last_workout_synced_at` | 训练管线已确认到的时间 |
| `last_synced_at` | **兼容列**：`greatest`（两列中非空的较新者）。旧客户端 / 生成类型仍读它 |

`health_sync_run` 加 `pipeline`：`health` | `workout`（旧行视为 `health` 或 `mixed`，iOS 新页按 pipeline 过滤；Web 不展示 run）。

checkpoint / runs 请求体加可选 `pipeline`，缺省：

- 仅含 workout/route 计数 → `workout`
- 否则 → `health`

实现时 **新 iOS 必须显式传**，不要靠推断。

`POST /health/sync/checkpoint`：只推进对应列，再回写兼容 `last_synced_at`。响应可同时带回两个水位；`last_synced_at` 字段保留以免旧解码失败。

`DELETE /health/data`：两列都清空（现有 `sync_state_cleared` 语义不变）。

### 5.2 上传端点

七个 upsert **路径和 body 不变**。不新增「训练夹带曲线」接口。

可选防护（服务端，不改 Web）：`/sync/workouts` 若未来 body 被加 `samples` / `heart_rate` 字段，直接忽略或 400。本期 iOS 根本不传。

脏日期：只在 quantity / sleep / stand / heartbeat upsert 后标记。workout upsert **不**标脏、**不** `recompute_daily_metrics`。

09-10 的「checkpoint / finishRun 去掉同步重算」仍然有效，建议与拆分一起做，否则健康 90 天仍会卡在日表重算上。这不改 Web 页面。

### 5.3 已有用户迁移

Alembic：

```text
last_health_synced_at  = last_synced_at
last_workout_synced_at = last_synced_at
```

含义：旧客户端曾经混合传过，两边都当成「已经追上」。新 iOS 清空本地混合队列后：

- 健康增量靠 **重建健康锚点**（或水位非空走锚点；锚点被清则 2 天修复 + 用户可时间段重传）
- 训练：`localAcked` 空，但水位非空 → 增量锚点；锚点空则拉近 90 天 workout，upsert 幂等，不会复制行

若产品希望升级后强制两边再各跑一次 90 天：迁移时两列写 NULL，并清空 `last_synced_at`。**默认不这么做**——避免老用户升级后被突然全量。文档里把这当成开关，实现前产品点头即可。

### 5.4 明确不改的读路径

- `build_workout_detail` 仍按时间窗切 `WINDOW_METRIC_TYPES`
- `workout_out` 列表仍读 session 摘要列
- 日卡片仍读 `health_metrics_daily`
- 训练详情公式（区间、TRIMP、RI）在 `hr_series` 为空时走现有降级（只用 `avg_hr_bpm` 或显示空）—— **不要为拆分改公式或前端**

---

## 6. 用户能看到的组合

| 用户操作 | Web 训练列表 / 信封 / 地图 | Web 训练曲线 | Web 现状卡片 |
|----------|----------------------------|--------------|--------------|
| 只授权，未同步 | 空 | 空 | 空 |
| 只同步训练 | 有 | 空（现有不画轴） | 空 |
| 只同步健康 | 空 | 无训练可进 | 有（rollup 完成后） |
| 两路都同步 | 有 | 有（样本到达后） | 有 |
| Web 清除 | 空 | 空 | 空；两路水位空，iOS 两页都回到首次 |

这是拆分的产品语义，不是 Web 要做的新 UI。

---

## 7. 实现顺序

建议按可独立验收的切片推进，Web 始终零 diff（除 `make codegen` 可能改 generated types，页面不引用新字段）。

1. **服务端水位拆列 + pipeline**  
   迁移、checkpoint/runs/status、清除。旧测试继续认 `last_synced_at`。补：只推健康水位时训练水位不变，反之亦然。

2. **iOS 导出拆函数**  
   `HealthKitStore` 分成健康 / 训练导出。单测：训练 export 的 payload 不含 `HealthQuantitySamplePayload`；健康 export 的 workouts 为空。

3. **两套 outbox + 两个 service**  
   删掉混合 drain 的路线等待逻辑。升级清旧库文件。

4. **重做两页 + 账号入口**  
   干掉 `HealthSyncView` 里的训练待同步列表。

5. **后台分流 + 锁屏文案**  
   Observer 不再用单一水位挡另一路。

6. **（可同期）健康侧瘦上传 / rollup**  
   见 09-10 §5；不阻塞训练页先上线。

每步都要有测试：服务端 `test_health_api.py` 扩水位；iOS `HealthSyncQueueTests` 拆成两套或作废重写。

---

## 8. 明确不做

- 改 Web `/my/health` 任何页面或「同步中」提示。
- 训练路径上传心率 / 跑步动力学 / 步数点，或新建训练曲线表。
- Android / Health Connect。
- 缩短任一侧的 90 天回看（训练是 90 天的 **场次**，健康是 90 个 **本地日**）。
- 把日表改成客户端 `HKStatisticsQuery` 为真相。
- 七个 upsert 合成一个大包。
- Celery。
- 为拆分做 protobuf。
- Web 发起重传。
- 兼容旧混合 outbox 行（升级即清）。

---

## 9. 现状对照（实现时打开这些文件）

客户端：

- `codes/mobile/ios/Timia/Features/Account/AccountView.swift`
- `codes/mobile/ios/Timia/Features/Health/HealthSyncView.swift`
- `codes/mobile/ios/Timia/Core/Health/HealthKitStore.swift`
- `codes/mobile/ios/Timia/Core/Health/HealthSyncService.swift`
- `codes/mobile/ios/Timia/Core/Health/HealthSyncQueue.swift`
- `codes/mobile/ios/Timia/Core/Health/HealthSyncDrain.swift`
- `codes/mobile/ios/Timia/Core/Health/HealthBackgroundDelivery.swift`
- `codes/mobile/ios/Timia/Core/API/HealthSyncAPI.swift`
- `codes/mobile/ios/Timia/Core/ScreenNotification/ScreenNotificationContentBuilder.swift`

服务端（只动同步写入 / 水位，不动 views UI 组装逻辑）：

- `app/models/health.py` — `HealthSyncState` / `HealthSyncRun`
- `app/routes/health.py`、`app/schemas/health.py`、`app/services/health_api.py`
- 新 Alembic
- `app/services/views/workout_detail.py` — **只读，确认曲线仍来自样本池，不要改**

Web：`codes/web/src/components/health/*` — **不要改**。
