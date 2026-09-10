# Timia 健康数据表与同步机制

> 对照 2026-09 当前实现梳理。数据归属是个人域（`owner_user_id`），不进 workspace，不写 `activity_log`。源数据来自 iOS HealthKit，服务端 Postgres 存样本 + 日汇总，Web 只读展示。
>
> 下一版同步重规划（瘦上传、脏日期后台汇总、展示优先、时间段重传）见 [2026-09-10-health-sync-replan-design.md](../superpowers/specs/2026-09-10-health-sync-replan-design.md)。

相关实现：`codes/core-service/app/models/health.py`、`app/services/health_api.py`、`codes/mobile/ios/Timia/Core/Health/`。早期产品决策见 [health-domain-design](../superpowers/specs/2026-08-27-health-domain-design.md)；后续增量见 [sync-resume](../superpowers/specs/2026-09-04-health-sync-resume-design.md)、[clear-watermark](../superpowers/specs/2026-09-04-health-clear-server-watermark-design.md)、[sync-performance](../superpowers/specs/2026-09-05-health-sync-performance-design.md)。

---

## 1. 总览

```
Apple Watch / iPhone 健康 App
        │ 写入 HealthKit
        ▼
iOS Timia
  HealthKitStore          时间窗导出（首次 / 修复）或 HKQueryAnchor 增量
  HealthKitAnchorStore    每类型一个 HKQueryAnchor（UserDefaults）
  HealthSyncQueue         SQLite outbox（待上传批次）
  HealthSyncDrain         前台全力 / 后台限额 drain
  HealthBackgroundDelivery  HKObserver + beginBackgroundTask
        │  gzip JSON  POST /health/sync/*
        ▼
core-service
  GzipRequestMiddleware
  health_api  INSERT … ON CONFLICT (owner, hk_uuid)
  health_sync_state.last_synced_at   服务端水位（权威）
  health_metrics_daily               checkpoint / finishRun 时重算
        │
        ▼
Web  GET /views/me/health*   读日表 + 训练 + 样本下钻
```

三套进度互不替代：

| 机制 | 存在哪 | 含义 |
|------|--------|------|
| `HKQueryAnchor`（本地，按类型） | iOS UserDefaults `timia.health.hkAnchor.*` | HealthKit 已经读到哪；只在 enqueue 成功后推进 |
| SQLite outbox 行状态 | `timia.health.outbox.sqlite` | 哪些批次还没被服务端 ACK；杀进程可恢复 |
| 服务端水位 `health_sync_state.last_synced_at` | Postgres | 服务端已确认的时间点；Web 清除后变 `NULL`，客户端必须跟 |

Web 清除后服务端水位清空；客户端下次拉 `GET /health/sync-status` 看到 `last_synced_at == null`，清掉本地锚点 + 队列 + 缓存，走 90 天首次同步。

---

## 2. 共性约定

- **归属**：所有表都有 `owner_user_id → users.id ON DELETE CASCADE`。只认当前登录用户，不走 workspace 权限。
- **幂等**：样本 / 睡眠 / 站立 / 心跳序列 / 训练以 `(owner_user_id, hk_uuid)` 唯一。路线以 `(owner_user_id, workout_hk_uuid)` 唯一。重复上传覆盖更新，并把 `deleted_at` 清回 `NULL`（复活）。
- **软删**：同步删除写 `deleted_at`，读路径默认 `deleted_at IS NULL`。Web「清除全部」是硬删。
- **时间**：业务时间用 `timestamptz`（UTC 存、按时区切日）。`created_at` / `updated_at` 来自 `TimestampMixin`。
- **时区**：请求体带 `timezone`（默认 `Asia/Shanghai`）。也接受 `GMT+0800` 这类固定偏移，服务端归一成 `Etc/GMT-8`。睡眠日归属用样本自己的 `timezone`。
- **切日规则**：
  - 数量 / 站立 / 心跳 / 训练：`local_date_of(start_at, tz)`
  - 睡眠：`local_date_of(end_at, sample.timezone)`（昨晚的觉算今天）
- **缺失值**：日汇总空列必须是 `NULL`，禁止用 `0` 冒充没数据。
- **不写活动日志**。

Alembic 演进：`0026` 建域 → `0027` 卡片布局 → `0028` 训练摘要扩列 → `0029` 档案 → `0030` 路线 / 海拔 / 最大心率 → `0031` 同步 run / 水位 → `0032` 未删除行的部分索引。

---

## 3. 数据表

共 12 张 Postgres 表，按用途分四类。

### 3.1 原始样本（HealthKit 一条对应一行，或展开成多行）

#### `health_sample_quantity`

数量样本的统一表，用 `metric_type` 区分指标。这是行数最大的表（心率主导）。

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | UUID PK | |
| `owner_user_id` | UUID FK | |
| `hk_uuid` | UUID | HealthKit 对象 UUID；数量序列展开点用派生 UUID（见 §5.3） |
| `metric_type` | VARCHAR(32) | 见下表 |
| `start_at` / `end_at` | timestamptz | 瞬时指标两端接近；累计型为区间 |
| `value` | FLOAT | |
| `unit` | VARCHAR(16) | |
| `source_bundle_id` / `source_name` | VARCHAR(200) 可空 | 写入来源（手表 / iPhone / 第三方） |
| `metadata` | JSONB 可空 | ORM 字段名 `extra_metadata`，列名仍是 `metadata` |
| `deleted_at` | timestamptz 可空 | |
| `created_at` / `updated_at` | timestamptz | |

约束与索引：

- `UNIQUE (owner_user_id, hk_uuid)` → `uq_health_sample_quantity_owner_hk`
- `ix_health_sample_quantity_owner_type_start` `(owner, metric_type, start_at)`
- `ix_health_sample_quantity_owner_start` `(owner, start_at)`
- 部分索引（`deleted_at IS NULL`）：`…_owner_type_start_alive`、`…_owner_start_alive`

`metric_type` 与单位（`QUANTITY_METRIC_TYPES`）：

| `metric_type` | 单位 | HealthKit | 典型节奏 |
|---------------|------|-----------|----------|
| `heart_rate` | `bpm` | `heartRate` | 日常约 5 分钟；锻炼约 5 秒 |
| `resting_heart_rate` | `bpm` | `restingHeartRate` | 每天 1 条，当天可能改写 |
| `hrv_sdnn` | `ms` | `heartRateVariabilitySDNN` | 一天数条 |
| `basal_energy` | `kcal` | `basalEnergyBurned` | 全天多段 |
| `active_energy` | `kcal` | `activeEnergyBurned` | 全天多段，锻炼更碎 |
| `step_count` | `count` | `stepCount` | 多段累计 |
| `distance_walking_running` | `m` | `distanceWalkingRunning` | 多段累计 |
| `distance_cycling` | `m` | `distanceCycling` | 多段累计 |
| `flights_climbed` | `count` | `flightsClimbed` | 多段累计 |
| `exercise_time` | `min` | `appleExerciseTime` | 多段累计 |
| `stand_time` | `min` | `appleStandTime` | 多段累计 |
| `body_mass` | `kg` | `bodyMass` | 每次称重 |
| `oxygen_saturation` | `fraction` | `oxygenSaturation` | 0–1（0.98 = 98%） |
| `vo2_max` | `ml_kg_min` | `vo2Max` | 合格户外走/跑后 |
| `cardio_recovery` | `bpm` | `heartRateRecoveryOneMinute` | 锻炼结束后约 1 条 |
| `running_speed` | `m/s` | `runningSpeed` | 跑步动力学，进训练详情 |
| `running_stride` | `m` | `runningStrideLength` | 同上 |
| `running_power` | `W` | `runningPower` | 同上 |
| `running_vertical_oscillation` | `mm` | `runningVerticalOscillation` | iOS 读厘米再 ×10 |
| `running_ground_contact` | `ms` | `runningGroundContactTime` | iOS 读秒再 ×1000 |

血氧客户端若读到百分数（>1）会先除以 100 再上传。

#### `health_sample_sleep`

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | UUID PK | |
| `owner_user_id` | UUID FK | |
| `hk_uuid` | UUID | |
| `start_at` / `end_at` | timestamptz | |
| `stage` | VARCHAR(20) | `in_bed` / `awake` / `core` / `deep` / `rem` / `unspecified` |
| `timezone` | VARCHAR(64) | 该段归属时区 |
| `source_*` / `deleted_at` / 时间戳 | | |

`UNIQUE (owner, hk_uuid)`。索引：`(owner, start_at)` + 未删除部分索引。

不建「睡眠会话」表。一晚带子图用时间重叠现场拼。`in_bed` 与分期时段重叠，两层都存；汇总入睡时长只加 `core|deep|rem|unspecified`，**不加** `in_bed`。

#### `health_sample_stand_hour`

| 列 | 类型 | 说明 |
|----|------|------|
| `stood` | BOOLEAN | 该小时是否达到「已站立」 |
| 其余 | | 与睡眠同类：`hk_uuid`、区间、来源、软删 |

通常整点一小时一条分类样本。日汇总 `stand_hours` = 当日 `stood = true` 的条数。

#### `health_series_heartbeat`

Tachogram。一段间隔数组，不把每一跳拆成行。

| 列 | 类型 | 说明 |
|----|------|------|
| `interval_count` | INT | |
| `intervals` | JSONB | `[{"t": 0.82, "gap": false}, …]`，`t` 为相对 `start_at` 的秒 |

与附近的 `hrv_sdnn` 样本不对齐建外键。

---

### 3.2 训练

#### `health_workout_session`

每次 `HKWorkout` 一行。训练内心率曲线不冗余存储，详情页按 `[start_at, end_at]` 查 `health_sample_quantity` 的 `heart_rate`。

| 列 | 类型 | 说明 |
|----|------|------|
| `hk_uuid` | UUID | HealthKit workout UUID |
| `activity_type` | VARCHAR(32) | 归一化 token，未知塌成 `other` |
| `activity_type_raw` | VARCHAR(80) | HealthKit 原始名 / `HKWorkoutActivityType(rawValue: N)` |
| `start_at` / `end_at` | timestamptz | |
| `duration_seconds` | INT | |
| `active_energy_kcal` / `distance_m` | FLOAT 可空 | 该次摘要 |
| `avg_hr_bpm` / `max_hr_bpm` | FLOAT 可空 | |
| `avg_cadence_spm` | FLOAT 可空 | 跑走：步数/分钟；骑行：踏频 |
| `avg_pace_sec_per_km` | FLOAT 可空 | |
| `elevation_ascended_m` / `elevation_descended_m` | FLOAT 可空 | |
| `weather_temp_c` / `weather_humidity` | FLOAT 可空 | 湿度存 0–1 |
| `location_country` / `location_admin` / `location_city` | VARCHAR(64) 可空 | 当前 iOS 上传为 `nil` |
| `source_*` / `metadata` / `deleted_at` | | |

`activity_type` 目录在 `app/models/health_types.py`（约 80 个 token，含 `running` / `hiit` / `strength` / `yoga` …）。客户端若写成 `other` 但 `activity_type_raw` 能解析，服务端下次 upsert 会改回真实类型。

#### `health_workout_route`

| 列 | 类型 | 说明 |
|----|------|------|
| `workout_hk_uuid` | UUID | 对应训练的 HealthKit UUID，**不是**独立路线 UUID |
| `points` | JSONB | `[{"t", "lat", "lng", "alt?"}, …]`，`t` 相对训练开始的秒 |
| `point_count` | INT | |
| `deleted_at` | | 删训练时一并软删 |

`UNIQUE (owner, workout_hk_uuid)`。上传前必须已有未删除的训练行，否则 `400 workout_not_found`。单条路线最多 1800 点（iOS 降采样）。一批最多 10 条。

---

### 3.3 派生与展示配置

#### `health_metrics_daily`

一人一天一行。Web 概览 / 7·30·90 趋势默认读这张表，不扫原始样本。

| 列 | 算法 |
|----|------|
| `owner_user_id` + `local_date` + `timezone` | 用户时区自然日 |
| `steps` | 累计型去重求和 `step_count` |
| `distance_m` | 步行跑步距离 + 骑行距离（各自去重后再加） |
| `flights_climbed` / `exercise_minutes` / `stand_minutes` | 对应累计型去重求和 |
| `stand_hours` | `COUNT(stand_hour WHERE stood)`，没有则为 `NULL` |
| `basal_energy_kcal` / `active_energy_kcal` | 分别求和；总消耗只在展示层相加 |
| `hr_min` / `hr_avg` / `hr_max` / `hr_count` | 当日 `heart_rate` |
| `resting_hr_bpm` | 当日最后一条 `resting_heart_rate` |
| `hrv_median_ms` | 当日 `hrv_sdnn` 中位数 |
| `spo2_min` / `spo2_avg` / `spo2_max` | 当日血氧 |
| `sleep_*_minutes` | 见睡眠归属；`sleep_asleep` = core+deep+rem+unspecified |
| `body_mass_kg` / `vo2_max` / `cardio_recovery_bpm` | 当日最后一条 |

`UNIQUE (owner, local_date)`。

**累计型去重**（`sum_cumulative_deduped`）：把每条样本看成 `[start, end]` 上的均匀速率；重叠区间只保留最大速率，再积分。对齐 Apple 健康「多源重叠不重复加」的做法。瞬时 / 缺结束时间按 1 秒窗处理。

**重算时机（当前实现）**：upsert 批次**不**立刻重算。只在：

1. `POST /health/sync/checkpoint`：重算 `to_at` 所在日及其前一天
2. `POST /health/sync/runs` 且 `status=success`：重算 payload 里的 `local_dates`；若没带日期则按 `from_at`–`to_at` 展开（时区写死 `Asia/Shanghai`）

窗口查询取 `local_date-1` 到 `local_date+2` 的样本，再按切日规则过滤，避免跨日样本漏算。

#### `health_insight_daily`

一人一天一篇 AI 总结。表和 Web 读取已就绪；**生成 job 尚未落地**（设计里是每日 cron + MiniMax，表里目前不会自动长出行）。

| 列 | 说明 |
|----|------|
| `status` | `pending` / `success` / `failed` |
| `source_fingerprint` | 当日日表哈希，变了才重跑（设计意图） |
| `summary` / `trends` / `suggestions` | 文案与 JSON 数组 |
| `provider` / `latency_ms` / `error_*` | |

`UNIQUE (owner, local_date)`。清除数据时一起硬删。

#### `health_profiles`

一人一行。用户自填，**不随「清除健康数据」删除**。

| 列 | 约束 |
|----|------|
| `sex` | `female` / `male` / `other`（见 `health_scores.PROFILE_SEXES`） |
| `age_years` | 1–120 |
| `height_cm` | 50–250 |
| `max_hr_bpm` | 80–220；训练心率区间用 |

#### `health_metrics_layout`

一人一行。健康页卡片顺序 JSON 数组。清除时保留。未知 key 丢掉，缺的用默认序补齐：

`steps, active, basal, exercise, stand, rhr, sleep, weight, hrv, vo2, recovery, spo2`

---

### 3.4 同步控制

#### `health_sync_state`

一人一行水位。

| 列 | 说明 |
|----|------|
| `last_synced_at` | 服务端权威水位；只向前推进（`to_at` 更大才写） |
| `last_run_id` | 最近一次成功 `health_sync_run.id`；checkpoint 不改这个 |

`UNIQUE (owner_user_id)`。`DELETE /health/data` 会删掉这一行。

#### `health_sync_run`

一次完整同步尝试的历史（手动或后台）。`GET /health/sync-status` 返回最近 50 条。

| 列 | 说明 |
|----|------|
| `source` | `manual` / `background` |
| `status` | `success` / `failed` |
| `started_at` / `finished_at` / `from_at` / `to_at` | |
| `quantity_count` 等 6 个计数 | 客户端上报的导出量，不是服务端精确行数 |
| `upserted` | 客户端 drain 成功批次数（语义偏客户端） |
| `local_dates` | JSONB 字符串日期列表，供 finish 时重算 |
| `error` | 最多 400 字 |

索引：`(owner_user_id, started_at)`。

---

### 3.5 表关系（逻辑，无跨表 FK 除 users）

```
users
 ├── health_profiles                 1:1  档案（清除保留）
 ├── health_metrics_layout           1:1  卡片序（清除保留）
 ├── health_sync_state               1:1  水位
 ├── health_sync_run                 1:N  同步历史
 ├── health_metrics_daily            1:N  日汇总
 ├── health_insight_daily            1:N  AI
 ├── health_sample_quantity          1:N
 ├── health_sample_sleep             1:N
 ├── health_sample_stand_hour        1:N
 ├── health_series_heartbeat         1:N
 ├── health_workout_session          1:N
 └── health_workout_route            1:N  靠 workout_hk_uuid 对齐 session.hk_uuid
```

训练与数量样本、路线之间都没有数据库外键，靠时间窗和 `hk_uuid` 关联。

---

## 4. 同步机制

### 4.1 双路径导出

| 路径 | 何时 | 怎么读 HealthKit |
|------|------|------------------|
| **时间窗按日切片** | 首次（水位空）；锚点不健康时的 2 天修复 | `HKQuantitySeriesSampleQuery` 优先，空则退回 `HKSampleQuery`；睡眠 / 站立 / 训练 / 心跳用普通 sample query |
| **锚点增量** | 水位已有且全部类型锚点齐全 | 每类型一次 `HKAnchoredObjectQuery`，带出新增 + **删除** |

首次回看 **90 个本地日历日**。切片：`[start, end)` 按 `Calendar.current` 切自然日，首尾日可以是半天。空日也推进水位。

增量不再加固定 2 小时 overlap。锚点丢了才用近 **2 天** 时间窗修复，然后重写锚点。

### 4.2 前台：`syncFromWatermark`

入口：健康同步页点「同步」。先 `GET /health/sync-status`，`applyServerWatermark`（服务端 `null` 会清本地状态）。

```
水位 == nil
  → syncWindow(now-90d, now)     按日：导出 → enqueue → drain 当天 → checkpoint(sliceEnd)
  → 若首次同步耗时超过 1 分钟，再补一段 [首次结束, now]
  → persistCurrentAnchors(asOf: now)   用 start>=now 的空查询建立锚点，避免重读历史
  → finishRun(success)

水位有 + 锚点齐全
  → exportAnchoredChanges
  → enqueue（先落库再 save 锚点，防止中途崩溃丢增量）
  → drain 到队列空
  → checkpoint(now)
  → finishRun

水位有 + 锚点不齐 / 查询失败
  → syncWindow(now-2d, now)
  → 重写锚点
  → finishRun
```

按日切片时，drain 第 N 天会预读第 N+1 天的 HealthKit（只在内存，不提前 enqueue / checkpoint）。

### 4.3 后台：`syncBackgroundBudgeted`

`HealthBackgroundDelivery` 在已授权时于启动注册全部 `HKObserverQuery`，并 `enableBackgroundDelivery(.immediate)`。

唤醒后：

1. 拉 sync-status，套用服务端水位
2. **水位为空直接 return**（首次同步只允许前台）
3. `beginBackgroundTask` → `syncBackgroundBudgeted`
4. 预算：最多 **8 批** 或 **约 20 秒**
5. 只对 outbox 已空的本地日做 checkpoint；遇到还有 pending 的日就停，不跳过

观察类型（缺骑行距离 / 爬楼 / 跑步动力学，那些靠前台或锚点增量补）：心率、静息心率、HRV、步数、活动/静态消耗、步行跑步距离、锻炼分钟、站立时长、血氧、体重、VO2、有氧恢复、训练、睡眠、站立小时、heartbeat series。

Observer handler 必须调用系统 `completionHandler`，连续不回调会被停掉后台投递。模拟器测不了，要真机。

做不到手表每 5 秒立刻出现在 Web：延迟来自手表→手机、系统对 `stepCount` 等的限频、后台窗口和电量策略。

### 4.4 本地 Outbox（`HealthSyncQueue`）

文件：Application Support / `timia.health.outbox.sqlite`，WAL。

```sql
CREATE TABLE outbox (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  category TEXT NOT NULL,          -- samples|sleep|standHours|workouts|routes|heartbeats|deletions
  local_date TEXT NOT NULL,        -- YYYY-MM-DD，用来卡住当日 checkpoint
  payload BLOB NOT NULL,           -- snake_case JSON
  attempts INTEGER NOT NULL,
  status TEXT NOT NULL,            -- pending | uploading | failed
  created_at REAL NOT NULL
);
```

- enqueue：写入 `pending`
- drain 开始：`uploading` 整表打回 `pending`（恢复杀进程残留），`failed` 也会先 requeue 再试
- ACK：`DELETE` 该行
- 可重试失败（网络 / 5xx / 401）：回到 `pending`，`attempts++`
- 不可重试（4xx 校验、payload 解不开）：`failed`，不挡后续日的 checkpoint（会打一条 warning）

**入队切块**（与服务端上限对齐）：

| 类别 | 每批上限 |
|------|----------|
| deletions | 500 |
| samples | 500 |
| sleep / standHours | 200 |
| workouts | 50 |
| routes | 10（每条 ≤1800 点） |
| heartbeats | 20 |

顺序意图：`deletions → samples → sleep → stand → workouts → routes → heartbeats`。

锚点导出按样本 `end_at` 的本地日分桶再入队。删除没有时间戳，挂在「今天」。路线尽量跟同 `hk_uuid` 的训练同一天，找不到就挂今天。

### 4.5 Drain 调度（`HealthSyncDrain`）

并发上限 4。波次优先级：

1. 删除
2. Group A 可并行：`samples ∥ sleep ∥ standHours ∥ heartbeats`
3. 训练
4. 路线——若存在更早 id、或 `local_date` 不晚于该路线的 **未完成训练行**，则跳过（保证先有 session 再传 route）

同步 POST：`Content-Encoding: gzip`，超时 60s。服务端 `GzipRequestMiddleware` 解压；坏 gzip → `400 content_encoding_invalid`；解压后超过 20 MiB → `413 gzip_body_too_large`。未压缩请求仍接受。

### 4.6 服务端写入

所有 upsert 走 `INSERT … ON CONFLICT DO UPDATE`。同一请求内按 `hk_uuid` 去重留最后一条（Postgres 不允许一次 statement 碰同一冲突行两次）。

| 接口 | 作用 |
|------|------|
| `POST /health/sync/samples` | 数量样本 |
| `POST /health/sync/sleep` | 睡眠段 |
| `POST /health/sync/stand-hours` | 站立小时 |
| `POST /health/sync/heartbeat-series` | Tachogram |
| `POST /health/sync/workouts` | 训练 |
| `POST /health/sync/workout-routes` | 路线（须已有 live workout） |
| `POST /health/sync/deletions` | 软删；训练会连带软删路线 |
| `POST /health/sync/checkpoint` | 推进水位 + 重算 to_at 日及前一天（不写 run） |
| `POST /health/sync/runs` | 记一次同步；success 才推进水位并重算日期 |
| `GET /health/sync-status` | 水位 + 近 90 日条数（来自日表近似 + 训练/心跳实查）+ 最近 50 次 run |
| `DELETE /health/data` | 硬清样本域，保留档案和卡片布局 |

鉴权：`get_current_user`。错误：`401`；`400` + snake_case（`batch_too_large` / `unknown_metric_type` / `unknown_sleep_stage` / `unknown_deletion_kind` / `too_many_points` / `workout_not_found` / `invalid_timezone` / `invalid_date_range`）。

`sync-status` 的日条数**不是**精确样本计数：quantity 用日表 `hr_count`（或「有任一汇总列」则记 1）；sleep 看 `sleep_asleep_minutes` 是否非空；stand 用 `stand_hours`。给 iOS 列表对账用，不是审计。

水位只增不减：`if state.last_synced_at is None or to_at > last_synced_at`。

---

## 5. HealthKit 读取细节

### 5.1 授权

`HealthPermissionManager` 一次 `requestAuthorization(toShare: [], read:)`。申请的读类型见该类 `readTypes`：训练、路线、heartbeat、上表全部 quantity（含跑步动力学 / 步行与骑行速度 / 骑行踏频）、睡眠、站立小时。

不申请 ECG、临床记录、生殖健康、营养明细。用户可在系统设置里关掉个别类型；关掉的类型不同步，不当成全局失败。

授权入口：iOS「我的 → 健康与健身」。Web 不做授权。

### 5.2 数量序列展开

累计型（步数、消耗等）可能被系统压成 quantity series。时间窗导出：

1. 先 `HKQuantitySeriesSampleQuery`，每个 interval 一行
2. 结果为空再退回普通 `HKSampleQuery`

### 5.3 派生 `hk_uuid`

序列展开点若共用父样本 UUID，会在 `(owner, hk_uuid)` 上互相覆盖。因此：

```
seed = "{parentUUID}|{interval.start.timeIntervalSince1970}"
hk_uuid = SHA256(seed) 取 16 字节，做成 UUID v5 风格
```

普通样本仍用 HealthKit 原 UUID（小写）。

### 5.4 训练摘要与路线

训练 payload 优先用 `HKWorkout.statistics`，没有再对该时间窗跑 `HKStatisticsQuery`。步频：骑行用 `cyclingCadence`；跑走用步数 / 分钟（时长 >30s 且 SPM≥20）。配速：速度统计或 `duration / (distance/1000)`。

路线：`HKSeriesType.workoutRoute()` + `HKWorkoutRouteQuery` 拉全部 `CLLocation`，按时间排序，均匀降到 ≤1800 点。少于 2 点不上传。

### 5.5 删除映射

锚点查询带出的 `HKDeletedObject` → `{ hk_uuid, kind }`：

| 类型 key | `kind` |
|----------|--------|
| 各 quantity metric | `quantity` |
| `sleep` | `sleep` |
| `stand_hour` | `stand_hour` |
| `heartbeat` | `heartbeat_series` |
| `workout` | `workout`（服务端再软删对应 route） |

找不到的行静默跳过。时间窗首次导出的 `deletions` 为空（只扫现存样本）。

---

## 6. 清除与水位权威

Web「数据管理 → 清除全部健康数据」调用 `DELETE /health/data`。

**硬删**：quantity / sleep / stand / heartbeat / workout / route / daily / insight / sync_run / sync_state。

**保留**：`health_profiles`、`health_metrics_layout`。

之后 iOS 再打开同步页：

1. `sync-status.last_synced_at == null`
2. `applyServerWatermark(nil)` → 清 UserDefaults 水位、全部 HK 锚点、SQLite outbox
3. 走 90 天首次同步

本地 `UserDefaults` 的 `timia.health.lastSyncedAt` 只是缓存。旧的 `max(local, server)` 合并已弃用，避免 Web 清除后被本地旧水位盖回去。

---

## 7. 读路径（Web / Views）

写接口在 `/health`；页面聚合在 `/views/me/health*`，只读。

| 方法 | 路径 | 用途 |
|------|------|------|
| GET | `/views/me/health` | 现状卡片、近期训练、日序列、insight |
| GET | `/views/me/health/cards/{metric}` | 单指标下钻 |
| GET | `/views/me/health/workouts` | 训练分页 |
| GET | `/views/me/health/workouts/{id}` | 训练详情：路线、心率窗、跑步动力学 |

未同步过：整页空状态，引导去 iOS 授权。卡片没数据画「—」，不用 0。

档案 / 卡片顺序：`GET|PATCH /health/profile`、`PATCH /health/layout`。

---

## 8. 客户端模块地图

```
Timia/Core/Health/
  HealthPermissionManager.swift    一次授权
  HealthKitStore.swift             导出、序列展开、训练/路线、锚点查询
  HealthKitAnchorStore.swift       每类型 HKQueryAnchor
  HealthSyncQueue.swift            SQLite outbox
  HealthSyncDrain.swift            上传调度 + 遥测
  HealthSyncService.swift          首次 / 增量 / 修复 / 后台编排
  HealthBackgroundDelivery.swift   Observer + 后台预算 drain
Timia/Core/API/HealthSyncAPI.swift
Timia/Features/Health/HealthSyncView.swift
```

核心常量：`firstLookbackDays = 90`，`backgroundLookbackDays = 2`，`uploadConcurrency = 4`，后台预算 8 批 / 20s。

---

## 9. 量级与性能要点

单用户约一年：`health_sample_quantity`（心率为主）约 5 万–20 万行；睡眠 1–3 万；tachogram 几百到几千；训练几百；日表 ~365。当前用 B-tree + 未删除部分索引，未分区。

已经做的加速：gzip、批量 `ON CONFLICT`、日切 resume、Group A 并行、预读下一天、upsert 与日表重算解耦（重算集中在 checkpoint / finishRun）。

---

## 10. 和早期设计的差异（读代码时注意）

| 早期设计（2026-08-27） | 当前实现 |
|------------------------|----------|
| upsert 同事务立刻重算日表 | 延后到 checkpoint / finishRun，避免一批里同一天重算多次 |
| 服务端不存 HealthKit cursor | 仍不存锚点；但存了 `health_sync_state` 时间水位 |
| 后台直接时间窗 catch-up | 后台禁止首次 90 天；有水位后走锚点 + 预算 drain |
| 固定 2h overlap | 锚点健康时取消；仅修复路径用 2 天窗 |
| 客户端 deletions 未接线 | 已接线（锚点增量路径） |
| 训练类型只有 8 个粗类 | 约 80 个 HealthKit token |
| 无路线 / 跑步动力学 / 档案 | 都已有 |
| AI cron 每日一篇 | 表和展示在，job 未实现 |
| `activity_type` 仅 running/walking/… | 见 `health_types.py` 全表 |

---

## 11. 关键文件

| 层 | 文件 |
|----|------|
| ORM | `codes/core-service/app/models/health.py`、`health_types.py` |
| 同步业务 | `app/services/health_api.py`、`health_metrics.py` |
| 路由 / DTO | `app/routes/health.py`、`app/schemas/health.py` |
| 视图 | `app/routes/views/health.py`、`app/services/views/my_health.py` |
| gzip | `app/middleware/gzip_request.py` |
| 迁移 | `app/migrations/versions/0026`–`0032` |
| iOS | `codes/mobile/ios/Timia/Core/Health/*.swift` |
| Web 清数据 | `codes/web/src/components/health/HealthDataManage.tsx` |
