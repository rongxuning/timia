# Health Domain Design（健康与健身）

**Date:** 2026-08-27  
**Branch:** `feature/health`  
**Scope:** iOS HealthKit 一次授权 + 逐条同步（手动与后台近实时）+ core-service `health_*` 个人域 + Web 独立侧栏「健康」（现状、趋势、每日 AI）  
**Out of scope:** ECG 波形；watchOS 伴侣 App / `HKWorkoutSession` 直播心率；Android；工作空间共享健康数据；临床记录 / 生殖健康 / 营养明细；把健康明细写入 `activity_log`

## Goal

用户在 iOS「我的」一次性授权 Timia 读取本功能用到的全部健康类型。数据按 HealthKit 样本逐条同步到服务器（仅当前用户可见）。Web 新增「健康」页：看核心现状、近期训练、各指标趋势，以及每日更新的长期趋势总结与建议。

## Decisions (confirmed)

| Topic | Choice |
|-------|--------|
| 数据归属 | 个人域，只挂 `owner_user_id`，对齐便利贴；不进 workspace |
| 表名 | `health_{用途}_{对象}`。用途仅：`sample` / `workout` / `series` / `metrics` / `insight` |
| 同步粒度 | HealthKit 有一条就同步一条；日表只做派生汇总 |
| 心率 | 同步每条 `heartRate` 样本（约日常 5 分钟一条、锻炼 5 秒一条）；不传 ECG |
| Tachogram / HRV | 都同步：序列进 `health_series_heartbeat`，SDNN 进数量样本 |
| 后台同步 | 近实时增量（HealthKit 写入 iPhone 后尽快上传），不是手表逐跳直播 |
| 手动同步 | 待同步列表 + 同步按钮 + 已同步列表；同步时全屏遮罩与进度 |
| Web 入口 | 独立侧栏「健康」`/my/health`，不塞进「数据分析」 |
| 图表 | 概览/趋势用日汇总或 min/max/avg；原始点仅下钻 |
| AI | MiniMax；主机 cron 每日一篇；不诊断、不替代医疗建议 |
| 活动日志 | 健康写入不调用 `log_activity` |

---

## 1. 产品流程

### 1.1 iOS：授权

入口：`AccountView`（「我的」）在身份区与退出登录之间增加分区「健康与健身」。

- 未授权：行「授权健康数据」，一次 `requestAuthorization` 申请本 spec 列出的全部读权限（不申请 ECG）。
- 已授权：`NavigationLink` 进入同步页。
- 拒绝：提示前往「设置 → 健康 → 数据访问与设备 → Timia」。设置跳转复用现有 Settings deep link。
- 用户仍可在系统弹窗里关掉个别类型；关掉的类型不同步，不当成全局失败。

授权管理器放 `Timia/Core/Health/`，对齐 `SpeechPermissionManager`：一次申请，之后只读状态。

### 1.2 iOS：同步页

- 顶部：上次同步时间 + 「同步」按钮。
- **待同步**：本地队列中未 ACK 的数据，按自然日汇总（新到旧）。日期行展示各类型条数；**训练逐条列出**。
- **已同步**：已 ACK，同样按日汇总，训练仍逐条。
- 点同步：全屏半透明遮罩（对齐 `RecordingOverlay`）+ 进度（分类型已传/总数，如「训练 3/5 · 心率 400/1200 · 日指标重算 2/7」）。单日/单批成功才标已同步；失败留在待同步，可重试。
- 空状态：无权限 / 无数据 / 全部已同步。
- 说明文案：新数据会在写入 iPhone「健康」后自动同步；也可随时手动同步。网页图表按时间汇总，与系统健康 App 类似。

不把心率、步数等每一段铺成一行。

### 1.3 iOS：后台近实时

授权成功后启用 HealthKit Background Delivery。系统把新样本写入 iPhone HealthKit 后唤醒 Timia，增量入队并尽量上传。

做不到：Apple Watch 每 5 秒立刻出现在 Web。延迟来自手表→手机同步、系统限频（如 `stepCount` 约每小时最多一次）、后台执行窗口（约十几秒）与电量策略。

前台打开 App 时另跑 `HKAnchoredObjectQuery` 的 `updateHandler`，增量可快于纯后台。

### 1.4 Web

侧栏在「数据分析」旁增加 **健康**（图标 `monitor_heart`），路由 `/my/health`。`Breadcrumbs`、`next.config.js` rewrite、`api-catalog.ts` 一并登记。

单页三段：

1. **核心现状** + **近期训练**（最近 14 天，逐条 `health_workout_session`）
2. **趋势**（7 / 30 / 90 天）
3. **AI 智能分析**（只读，每日更新）

未授权或从未同步：整页空状态，指向 iOS「我的 → 健康与健身」。Web 不做授权。

现状卡片（无数据为「—」，不显示 0 冒充没戴表）：今日步数、活动消耗、静态消耗、锻炼分钟、站立小时、静息心率、昨夜睡眠、最近体重、最近 HRV、最近 VO2 Max、最近有氧恢复、最近血氧。

---

## 2. HealthKit：存什么 vs 怎么展示

健康 App **存储**的是样本；**图表**默认按时间桶聚合。Timia 对齐这一层：服务器存样本，Web 默认读日汇总。

| 指标 | HealthKit | 写入节奏（典型） | Timia 存储 |
|------|-----------|------------------|------------|
| 心率 | `heartRate` | 日常约 5 分钟 1 条；锻炼约 5 秒 1 条 | `health_sample_quantity` |
| 静息心率 | `restingHeartRate` | 每天 1 条（当天内可能改写） | 同上 |
| HRV | `heartRateVariabilitySDNN` | 一天数条 | 同上 |
| Tachogram | `HKSeriesType.heartbeat()` | 静止时偶尔一段 | `health_series_heartbeat` |
| 静态消耗 | `basalEnergyBurned` | 全天多段累计 | `health_sample_quantity` |
| 活动消耗 | `activeEnergyBurned` | 全天多段；锻炼中更碎 | 同上 |
| 步数 | `stepCount` | 多段累计 | 同上 |
| 步行跑步距离 | `distanceWalkingRunning` | 多段累计 | 同上 |
| 骑行距离 | `distanceCycling` | 多段累计 | 同上 |
| 爬楼 | `flightsClimbed` | 多段累计 | 同上 |
| 锻炼分钟 | `appleExerciseTime` | 多段累计 | 同上 |
| 站立时长 | `appleStandTime` | 多段累计 | 同上 |
| 站立小时 | `appleStandHour` | 通常每小时一条分类 | `health_sample_stand_hour` |
| 体重 | `bodyMass` | 每次称重 | `health_sample_quantity` |
| 血氧 | `oxygenSaturation` | 点测 + 静止/睡眠抽查 | 同上 |
| 最大摄氧量 | `vo2Max` | 合格户外走/跑/徒步后 | 同上 |
| 有氧恢复 | `heartRateRecoveryOneMinute` | 锻炼结束后约 1 条 | 同上 |
| 睡眠 | `sleepAnalysis` | 一晚多段分类 | `health_sample_sleep` |
| 训练 | `HKWorkout` | 每次锻炼 1 条 | `health_workout_session` |
| ECG | `HKElectrocardiogram` | 用户主动 30 秒 | **不同步** |

累计型（步数、距离、消耗等）可能被系统压缩成 quantity series。iOS 读取必须用 `HKQuantitySeriesSampleQuery` 或 `HKStatisticsQuery`，不能只用会漏点的普通 `HKSampleQuery`。

睡眠：`in_bed` 与分期时段重叠。两层都存。汇总实际入睡只加 `core|deep|rem|unspecified`，**不加** `in_bed`。夜间归属为该段 `end_at` 在用户时区的日历日（昨晚的觉算今天）。

有氧恢复：锻炼结束后手表再测约 3 分钟；结束过晚数值会偏小。VO2 / 血氧受机型与地区限制，没有样本当空，不当错误。

---

## 3. 数据模型

权限对齐便利贴：`owner_user_id == current_user`，否则 `404`（`{entity}_not_found`），避免泄露存在性。用户删除时全部 `CASCADE`。不写 `activity_log`。

表名规则：`health` + 用途 + 对象。ORM 类名与表名对应（PascalCase）。时间戳用 `UUIDPrimaryKeyMixin` + `TimestampMixin`。健康里删除的对象：同步 deletions 后写 `deleted_at`；读路径默认 `deleted_at IS NULL`。

幂等：`(owner_user_id, hk_uuid)` unique。

Migration：`0026_add_health_domain.py`，`down_revision = 0025_plan_mode_usage_kinds`。模型注册进 `app/models/__init__.py` 与 `app/migrations/env.py`。

### 3.1 `health_sample_quantity`

数量样本（形状相同，用 `metric_type` 区分）。

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | UUID PK | |
| `owner_user_id` | UUID FK users CASCADE | |
| `hk_uuid` | UUID | HealthKit 对象 UUID |
| `metric_type` | VARCHAR(32) | 见下表 |
| `start_at` / `end_at` | timestamptz | 心率常瞬时；累计型为区间 |
| `value` | DOUBLE PRECISION | |
| `unit` | VARCHAR(16) | |
| `source_bundle_id` | VARCHAR(200) 可空 | |
| `source_name` | VARCHAR(200) 可空 | |
| `metadata` | JSONB 可空 | 血氧高海拔、有氧恢复 test type、算法版本等 |
| `deleted_at` | timestamptz 可空 | |
| `created_at` / `updated_at` | timestamptz | |

`UNIQUE (owner_user_id, hk_uuid)`  
`INDEX (owner_user_id, metric_type, start_at DESC)`  
`INDEX (owner_user_id, start_at)`

| `metric_type` | `unit` | 值 |
|---------------|--------|-----|
| `heart_rate` | `bpm` | 心率 |
| `resting_heart_rate` | `bpm` | 静息心率 |
| `hrv_sdnn` | `ms` | HRV SDNN |
| `basal_energy` | `kcal` | 该段静态消耗 |
| `active_energy` | `kcal` | 该段活动消耗 |
| `step_count` | `count` | 该段步数 |
| `distance_walking_running` | `m` | 该段步行跑步距离 |
| `distance_cycling` | `m` | 该段骑行距离 |
| `flights_climbed` | `count` | 该段楼层 |
| `exercise_time` | `min` | 该段锻炼分钟 |
| `stand_time` | `min` | 该段站立分钟 |
| `body_mass` | `kg` | 体重 |
| `oxygen_saturation` | `fraction` | 0–1（0.98 = 98%） |
| `vo2_max` | `ml_kg_min` | 最大摄氧量 |
| `cardio_recovery` | `bpm` | 1 分钟心率下降 |

### 3.2 `health_sample_sleep`

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | UUID PK | |
| `owner_user_id` | UUID FK | |
| `hk_uuid` | UUID | |
| `start_at` / `end_at` | timestamptz | |
| `stage` | VARCHAR(20) | `in_bed` / `awake` / `core` / `deep` / `rem` / `unspecified` |
| `timezone` | VARCHAR(64) | |
| `source_*` | | |
| `deleted_at` / 时间戳 | | |

`UNIQUE (owner_user_id, hk_uuid)`  
`INDEX (owner_user_id, start_at)`

不建 session 表；一晚带子图用时间重叠现场拼。

### 3.3 `health_sample_stand_hour`

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | UUID PK | |
| `owner_user_id` | UUID FK | |
| `hk_uuid` | UUID | |
| `start_at` / `end_at` | timestamptz | 通常整点一小时 |
| `stood` | BOOLEAN | 该小时是否达到「已站立」 |
| `source_*` / `deleted_at` / 时间戳 | | |

`UNIQUE (owner_user_id, hk_uuid)`  
`INDEX (owner_user_id, start_at)`

### 3.4 `health_series_heartbeat`

Tachogram。一段间隔数组，不把每一跳拆成行。

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | UUID PK | |
| `owner_user_id` | UUID FK | |
| `hk_uuid` | UUID | |
| `start_at` / `end_at` | timestamptz | |
| `interval_count` | INT | |
| `intervals` | JSONB | `[{"t": 0.82, "gap": false}, ...]`，`t` 为相对 `start_at` 的秒 |
| `source_*` / `deleted_at` / 时间戳 | | |

`UNIQUE (owner_user_id, hk_uuid)`  
`INDEX (owner_user_id, start_at DESC)`

与同时间附近的 `hrv_sdnn` 样本不对齐建 FK。

### 3.5 `health_workout_session`

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | UUID PK | |
| `owner_user_id` | UUID FK | |
| `hk_uuid` | UUID | |
| `activity_type` | VARCHAR(32) | 归一化：`running` / `walking` / `cycling` / `hiking` / `swimming` / `strength` / `yoga` / `other` |
| `activity_type_raw` | VARCHAR(64) | HealthKit 原始名 |
| `start_at` / `end_at` | timestamptz | |
| `duration_seconds` | INT | |
| `active_energy_kcal` | DOUBLE 可空 | 该次摘要 |
| `distance_m` | DOUBLE 可空 | |
| `avg_hr_bpm` / `max_hr_bpm` | DOUBLE 可空 | |
| `source_*` / `metadata` | | |
| `deleted_at` / 时间戳 | | |

`UNIQUE (owner_user_id, hk_uuid)`  
`INDEX (owner_user_id, start_at DESC)`

训练内心率曲线不冗余存储，下钻时按时间窗查 `heart_rate` 样本。

### 3.6 `health_metrics_daily`

一人一天一行。某日样本 upsert 成功后，**同一事务**按该 `local_date` 重算。Web 概览和 7/30/90 默认读这张表。没有样本的列保持 `NULL`，禁止用 0 表示缺失。

| 列 | 算法 |
|----|------|
| `owner_user_id` + `local_date` + `timezone` | 用户时区自然日 |
| `steps` | `SUM(step_count)` |
| `distance_m` | `SUM(distance_walking_running) + SUM(distance_cycling)` |
| `flights_climbed` | `SUM(flights_climbed)` |
| `exercise_minutes` | `SUM(exercise_time)` |
| `stand_minutes` | `SUM(stand_time)` |
| `stand_hours` | `COUNT(health_sample_stand_hour WHERE stood)` |
| `basal_energy_kcal` / `active_energy_kcal` | 对应 `SUM` |
| `hr_min` / `hr_avg` / `hr_max` / `hr_count` | 当日 `heart_rate` |
| `resting_hr_bpm` | 当日最后一条 `resting_heart_rate` |
| `hrv_median_ms` | 当日 `hrv_sdnn` 中位数 |
| `spo2_min` / `spo2_avg` / `spo2_max` | 当日血氧 |
| `sleep_in_bed_minutes` 等分期分钟 | 归属该日的 sleep 段 |
| `body_mass_kg` | 当日最后一条体重 |
| `vo2_max` | 当日最后一条 |
| `cardio_recovery_bpm` | 当日最后一条 |
| `updated_at` | |

`UNIQUE (owner_user_id, local_date)`

睡眠归属见 §2。消耗：活动与静态分开存，总消耗仅展示层相加。

### 3.7 `health_insight_daily`

| 列 | 说明 |
|----|------|
| `owner_user_id` + `local_date` | 一人一天一篇 |
| `status` | `pending` / `success` / `failed` |
| `source_fingerprint` | 当日 `health_metrics_daily` 行哈希；变了才重跑 |
| `summary` | 总述 |
| `trends` | JSONB 数组 |
| `suggestions` | JSONB 数组 |
| `provider` / `latency_ms` / `error_code` / `error_message` | 对齐便利贴 AI |
| 时间戳 | |

`UNIQUE (owner_user_id, local_date)`

不建服务端 HealthKit cursor 表。`HKQueryAnchor` 只存在 iOS 本地。

---

## 4. 同步协议（iOS → 服务端）

### 4.1 本地队列

SQLite 待发送队列为真相源之一：

- 项：`kind`（`quantity` / `sleep` / `stand_hour` / `heartbeat_series` / `workout` / `deletion`）+ payload
- 按类型持久化 `HKQueryAnchor`
- 后台：无遮罩，预算内 drain；超时留下次
- 手动：先 catch-up 拉增量，再 drain，带遮罩

首次授权默认回填 **90 天**，全部进待同步，并自动开一次前台同步。

### 4.2 后台投递

- Entitlements：`com.apple.developer.healthkit` + `com.apple.developer.healthkit.background-delivery`
- Info.plist：`NSHealthShareUsageDescription`、`NSHealthUpdateUsageDescription`（只读也声明后者）
- `project.yml` 增加 HealthKit capability 与 entitlements 文件
- 进程启动（`didFinishLaunching` / App init）就必须 `execute` 全部 `HKObserverQuery`，否则杀进程后接不到唤醒
- 各类型 `enableBackgroundDelivery(for:frequency: .immediate)`
- Observer handler 必须 `defer { completionHandler() }`；连续约 3 次不调用会被系统停掉后台投递
- 唤醒后：`beginBackgroundTask` → 按 anchor 拉增量（含删除）→ 入队 → 能传就传一批 → 持久化新 anchor
- **模拟器不能测后台投递，必须真机**

### 4.3 API

前缀 `/health`，鉴权 `get_current_user`。无 workspace 权限函数。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/health/sync-status?from=&to=` | 按日条数（各 sample 表 + workout），供列表对账 |
| POST | `/health/sync/samples` | upsert 数量样本，一批 ≤ 500 |
| POST | `/health/sync/sleep` | upsert 睡眠段，一批 ≤ 200 |
| POST | `/health/sync/stand-hours` | upsert 站立小时，一批 ≤ 200 |
| POST | `/health/sync/heartbeat-series` | upsert tachogram，一批 ≤ 20 |
| POST | `/health/sync/workouts` | upsert 训练，一批 ≤ 50 |
| POST | `/health/sync/deletions` | `{ hk_uuid, kind }` 列表，写 `deleted_at` 并重算受影响日 |

每批 upsert 后重算涉及的 `health_metrics_daily` 行。重复 `hk_uuid` 覆盖更新（健康里改写静息心率等）。

错误码：`401` 未登录；他人数据不出现（按 owner 过滤）；校验失败 `400` + snake_case detail（如 `batch_too_large`、`unknown_metric_type`）。

视图：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/views/me/health` | 整页：现状、近期训练、各指标日序列（默认 30 天）、最新 insight |
| GET | `/views/me/health/series?metric=&range=` | `range` 为 `7` / `30` / `90`；日粒度点 |

训练下钻心率：可用 `GET /views/me/health/workouts/{id}/heart-rate` 返回该时间窗样本（二期可做；第一期 Web 可只列表）。

变更 API 后 `make codegen`。手写 `src/types/api/views/health.ts` + `src/lib/api/health-views.ts`（与现有 views 一致）。`next.config.js` 增加 `/health/*` rewrite。

---

## 5. Web 页面

对齐 `/my/analytics` 的 `PageMain` + 标题 + 错误条。图表新增 **Recharts**（当前 web 无图表库）。

趋势：

- 步数、消耗、睡眠时长、HRV、血氧、站立：日折线（来自 `health_metrics_daily`）
- 心率：日 min–max 带 + 均线（对齐健康 App）
- 体重、VO2、有氧恢复：点少则按每次测量连线（可直接来自 sample 的日末值）
- 无数据的指标不渲染空图

AI 区：当日或最近 `success` 的 `summary` / `trends` / `suggestions`。`failed` 时展示上次成功 + 失败提示。从未生成：「将于每日更新后出现」。

UI 文案简体中文。无数据卡片不画空坐标轴。

---

## 6. AI 每日任务

对齐 `app/jobs/plan_reminders.py`：纯函数 + CLI，不引入 Celery。

```text
0 6 * * *  python -m app.jobs.health_insights
```

`deploy/local.sh` 的 cron 安装与规划提醒并列增加 `/etc/cron.d/timia-health-insights`。

逻辑：

1. 找出有 `health_metrics_daily`、且当日 insight 缺失或 `source_fingerprint` 已变的用户
2. 取约 90 天日汇总 + 近期训练摘要，结构化 prompt
3. MiniMax 输出 JSON：`summary`、`trends[]`、`suggestions[]`
4. 写入 `health_insight_daily`；失败记 `failed`，Web 回退上一次 success
5. Prompt 约束：只基于数据；不诊断、不开药；结尾固定「不能替代医生意见」

Web 不提供「立即再生成」。超时沿用 `settings.minimax_timeout_seconds`。

---

## 7. iOS 模块与授权类型

```text
Timia/Core/Health/
  HealthPermissionManager.swift
  HealthKitStore.swift          # 查询、展开 series、聚合成 API payload
  HealthSyncQueue.swift         # SQLite 队列 + anchor
  HealthBackgroundDelivery.swift
Timia/Core/API/HealthSyncAPI.swift
Timia/Features/Health/
  HealthSyncView.swift
```

`AccountView` 增加入口。App 启动注册 observer。

一次申请的读类型：

`workoutType`、`heartbeat` series、`heartRate`、`restingHeartRate`、`heartRateVariabilitySDNN`、`basalEnergyBurned`、`activeEnergyBurned`、`stepCount`、`distanceWalkingRunning`、`distanceCycling`、`flightsClimbed`、`appleExerciseTime`、`appleStandTime`、`appleStandHour`、`bodyMass`、`oxygenSaturation`、`vo2Max`、`heartRateRecoveryOneMinute`、`sleepAnalysis`。

不申请 ECG / 临床记录。

---

## 8. 权限、安全、合规

- 仅登录用户读写自己的行
- 不出现在工作空间活动流、成员、项目
- 不把原始 GPS 轨迹当独立类型同步（训练若带坐标，第一期 metadata 可不传路线）
- App Store 用途说明：同步到 Timia，供本人在网页查看趋势与建议
- AI 文案含非医疗免责

---

## 9. 分期

| 期 | 可验收 |
|----|--------|
| **P0 后端** | 7 张表 + 幂等 sync API + 日表重算 + `GET /views/me/health`（可无 AI） |
| **P1 iOS 前台** | 授权、队列、待同步/已同步、手动同步遮罩；真机把样本传到服务器 |
| **P2 iOS 后台** | Background Delivery；杀进程后仍能入队；真机验收 |
| **P3 Web 概览** | 侧栏「健康」、现状、近期训练、空状态 |
| **P4 趋势** | Recharts + 7/30/90 |
| **P5 AI** | cron + 页面展示 |

每一期可单独验收。P2 必须真机。

---

## 10. 测试与验证

后端（`cd codes/core-service && uv run pytest`）：

- 无 token `401`
- 只返回当前用户数据
- 重复 `hk_uuid` 幂等覆盖
- 睡眠汇总不加 `in_bed` 进入睡时长
- 日表在 upsert 后重算；全空列为 `NULL`
- `batch_too_large` / `unknown_metric_type`
- insight job：指纹未变不重跑；失败保留上次 success

iOS：授权、拒绝引导、遮罩进度、断网可重试、部分失败不影响已成功批、后台投递真机。

Web：无数据空态；有数据卡片/列表/趋势/AI；窄屏壳层不被挡。

`uv run ruff check .`；API 变更后 `make codegen`。

---

## 11. 量级

单用户约一年：`health_sample_quantity`（心率为主）约 5 万–20 万行；睡眠约 1 万–3 万；tachogram 几百到几千；训练几百；日表/insight ~365。第一期 B-tree 索引即可，不必分区。
