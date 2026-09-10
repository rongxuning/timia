# 健康 / 健身同步重规划

**Date:** 2026-09-10  
**Status:** 方案已内部多轮收敛，待实现  
**Depends on:** [health-domain](./2026-08-27-health-domain-design.md)、[sync-resume](./2026-09-04-health-sync-resume-design.md)、[clear-watermark](./2026-09-04-health-clear-server-watermark-design.md)、[sync-performance](./2026-09-05-health-sync-performance-design.md)、现状梳理 [health-data-and-sync](../../technical-solution/health-data-and-sync.md)

## Goal

把 iOS → 服务端 → Web 这条链路收成：**上传路径极瘦、展示尽快出现、中断可续、可按时间段重传、后台能自己跑完首次 90 天**。同步逻辑以简单为先，不为速度再叠第三套进度模型。

可验收结果：

1. 首次仍回看 **90 个本地日历日**。
2. 用户点同步后可以锁屏离开；首次 catch-up 在 `BGProcessingTask` 里继续导出 + 上传 + 服务端后台汇总。
3. 网络中断后从 **未 ACK 的 outbox 批次** 和 **已 checkpoint 的日水位** 续传，不重传已确认日。
4. 同步页可选起止日期，重传该窗，不改全局水位、不清全库。
5. Web：训练列表在训练行落地后即可看；现状卡片在日汇总算完即可看；心率曲线随样本到达逐步出现。
6. 上传请求只做 upsert；日汇总不在 upsert / checkpoint HTTP 里算。

---

## 0. 多轮收敛（怎么敲定的）

### 第 1 轮：慢在哪

先回答「数据量太大，还是服务端存的时候算太多」。两边都有，但 **热路径上的服务端汇总是自伤；字节量的大头是心率和展开后的累计序列**。

| 环节 | 量级（典型 90 天、戴表） | 现在是否挡上传 |
|------|--------------------------|----------------|
| HealthKit 按日导出 | 90 次查询；心率日常 ~288 点/天，锻炼约 5 秒一点 | 挡。按日串行，预读只能提前 1 天 |
| 数量样本 JSON | 心率约 4 万–8 万行；累计型 series 展开后步数/消耗也可上万 | 挡。500 条/批 × gzip，但仍是请求次数主力 |
| `INSERT … ON CONFLICT` 500 行 | 一次 SQL，通常几十毫秒 | 通常不挡 |
| **checkpoint 同步重算日表** | `recompute_daily_metrics` 把 **前后约 3 天、所有 metric_type** 的数量样本 load 进 ORM，再在 Python 里切日、扫重叠 | **挡。** 上传一天必须等这次重算返回 |
| finishRun 再重算一遍 `local_dates` | 首次可能 90 天 | 挡在最后一次 HTTP |

现实现状（`health_api.recompute_daily_metrics`）：

```text
SELECT * FROM health_sample_quantity
 WHERE owner=? AND deleted_at IS NULL
   AND start_at ∈ [local_date-1, local_date+2)
```

心率这种离散点只需要 `min/avg/max/count`，却被整行拉进 Python。步数重叠去重需要区间，但也不该和心率绑在同一次全表扫描里。

**判定规则（实现后仍用这条排查）：**

1. 看 client `sync.export_ms` vs `sync.upload_ms`。导出远大于上传 → HealthKit / 数据量。
2. 看 server 单次 upsert 耗时 vs checkpoint/rollup 耗时。upsert 快、checkpoint 慢 → 服务端算太多。
3. 看每批 `row_count` 与 `ingest_ms`。行数高且 ingest 线性涨 → 量；行数低却慢 → 额外逻辑。

### 第 2 轮：三条路

| | A. 只优化现有管线 | B. 客户端算日表，样本按需再传 | **C. 瘦上传 + 脏日期后台汇总 + 展示优先排队（选定）** |
|--|-------------------|------------------------------|------------------------------------------------------|
| 做法 | 加大 batch、SQL 化重算、仍放在 checkpoint | `HKStatisticsQuery` 先传 90 行日表，原始样本以后再说 | upsert 只写样本；脏日期表 + job；训练/睡眠等先传，心率后传 |
| 首次 Web | 仍等 checkpoint | 卡片极快，训练心率曲线长期空 | 训练信封先亮；卡片等廉价汇总；曲线随心率到达 |
| 简单 | 编排仍复杂 | 日表双源，对不齐 | 进度模型不新增；热路径减去重算 |
| 风险 | 锁屏后首次仍难跑完 | 和样本汇总打架 | job 要可靠；展示要能接受「先有训练后有曲线」 |

不选 A：解决不了「首次必须前台」和「选时间段重传」。  
不选 B：日表和样本两套真相，和「训练曲线来自公共样本池」冲突，也不简单。

### 第 3 轮：进度模型减不减

现在有三轨：HK 锚点、SQLite outbox、服务端 `last_synced_at`。曾想收成「只留 outbox」。否决：Web 清除后必须有服务端水位；增量必须有锚点，否则又回到 2 小时 overlap。

**敲定：三轨保留，职责写死，禁止再加第四轨（例如按类型的服务端 cursor）。**

### 第 4 轮：首次后台算什么

「首次同步时后台运算」两层都要：

- **手机：** 用户点同步后申请 `BGProcessingTask`，按日导出→入队→drain→checkpoint，锁屏继续。Observer **不**在水位为空时开 90 天导出。
- **服务器：** 上传返回后只记脏日期；`health_rollup` job（cron，对齐 `plan_reminders`）算日表。不引入 Celery。

### 第 5 轮：重传与水位

选时间段重传 = 对该窗走现有 `syncWindow`，upsert 覆盖。**不**把全局水位回拨。**不**清锚点（除非用户清除全部数据）。删点仍走增量锚点路径；时间窗导出带不出 HK 删除。

---

## 1. 产品行为

### 1.1 同步页（iOS）

- 授权、上次同步、同步按钮、待同步/已同步：保留。
- **新增**「重新同步时间段」：起止日期（默认近 7 天，上限 90 天，不能超过今天）。文案：不会清除服务器数据，只覆盖这段。
- 首次/续传进度：`正在同步 第 N/M 天 · YYYY-MM-DD · 训练已上传 / 指标排队`。
- 锁屏不中断首次：系统给处理任务就继续；被系统杀掉后，下次打开或下次处理任务从水位 + outbox 续。

### 1.2 后台自动同步

| 场景 | 行为 |
|------|------|
| 水位空、outbox 空 | Observer **return**。不在短唤醒里开 90 天。 |
| 水位空、outbox 有货 | 只 drain 队列（续上一次前台/处理任务入队的批次），不新开导出。 |
| 水位已有 | 锚点增量 → 入队 → 预算 drain（仍约 8 批 / 20s）；锚点坏则 2 天窗修复。 |
| 用户点了首次同步 | `BGProcessingTask` 跑按日循环，直到 90 天完成或系统收回时间。 |

### 1.3 Web

- 有 `health_workout_session` 就出近期训练，不等日表、不等心率样本。
- 现状卡片读 `health_metrics_daily`；该日仍在脏日期表里则卡片可出「汇总中」，已有列照常显示。
- 训练详情：信封（时长、距离、场均心率）立刻有；地图等路线；心率/步频曲线等窗口内 `health_sample_quantity` 到达（空则不画轴）。
- 选时间段重传只能在 iPhone 上做。Web 只提示去 App。

---

## 2. 架构

```
HealthKit
  │ 首次/重传：按日本地日切片（90 天或所选窗）
  │ 增量：每类型 HKQueryAnchor
  ▼
导出（可并行读 HK，写入仍按日）
  │ 入队顺序见 §4（展示优先，不是类型平行抢心率）
  ▼
SQLite outbox          断点：ACK 删行；uploading 杀进程打回 pending
  │ gzip POST
  ▼
FastAPI /health/sync/*  只 upsert + 给 local_dates 标脏
  │
  ├─ POST /health/sync/checkpoint   只推水位，不算日表
  ├─ POST /health/sync/runs         只记账，不算日表
  └─ job health_rollup              脏日期 → SQL/分类型重算 → 写 health_metrics_daily
        │
        ▼
Web GET /views/me/health*           训练表 + 日表 + 样本下钻
```

原则：**热路径 = 写字节并 ACK。日表、insight、训练详情公式都不在上传请求里跑。**

---

## 3. 数据怎么传（健康 vs 健身）

沿用已确认的 HealthKit 模型，同步时不要做成两套心率：

| 上传物 | 表 | 展示角色 | 队列优先级 |
|--------|----|----------|------------|
| `HKWorkout` | `health_workout_session` | 训练列表、详情信封 | P0 |
| 路线 | `health_workout_route` | 地图（须已有训练） | P0，且排在同日训练之后 |
| 睡眠 / 站立小时 | `health_sample_sleep` / `_stand_hour` | 睡眠卡、站立卡 | P1 |
| 低量数量：体重、RHR、HRV、VO2、恢复、血氧 | `health_sample_quantity` | 对应卡片 | P1 |
| 累计型：步数、消耗、距离、锻炼/站立分钟、爬楼 | 同上 | 活动类卡片 | P2 |
| 心率、跑步动力学 | 同上 | 心率卡、训练曲线 | P3 |
| Tachogram | `health_series_heartbeat` | 下钻 | P4 |
| 删除 | 软删 | 纠错 | P0 最先 |

训练时段心率 **仍是** `heart_rate` 样本，详情按 `[start_at, end_at]` 切。不建训练心率表。

---

## 4. 客户端同步（尽量简单的一条循环）

伪代码（手动、首次、时间段重传共用）：

```text
func runSync(window start..<end, source):
  slices = daySlices(start, end)          # 空窗则 finish 空 run
  for slice in slices:
    export = healthKit.export(slice)
    enqueue(export, localDate: slice.day) # 按 §3 拆批
    drain until pendingCount(day)==0      # 前台不限预算；BGProcessing 用更宽预算
    checkpoint(slice.end)                 # 仅水位；重传窗传 skipGlobalCheckpoint: true
  finishRun(success, counts)
```

增量（水位存在且锚点齐）：

```text
export, newAnchors = exportAnchored()
enqueue by local_date
save anchors                            # 仍须入队成功后再存
drain
if outbox empty: checkpoint(now)
finishRun
```

**相对现状要改的编排：**

1. **入队拆批按优先级**。`HealthSyncOutboxCategory` 把现在的单一 `samples` 拆成 `samplesCard`（P1 低量指标）、`samplesActivity`（P2 累计型）、`samplesHr`（P3 心率 + 跑步动力学）。睡眠/站立/训练/路线/心跳/删除类别不变。
2. **drain 波次**改为：`deletions → workouts → routes → samplesCard ∥ sleep ∥ standHours → samplesActivity → samplesHr → heartbeats`。同一波内仍可并发 4。路线仍受「更早训练未完成则等待」约束。
3. **数量批大小 500 → 1000**（gzip + 60s 已有）。睡眠/站立/训练/路线上限不动。
4. **首次允许后台：** `HealthBackgroundDelivery` 的 `watermark == nil → return` 改为：`nil 且 outbox 空 → return`；`nil 且 outbox 非空 → 只 drain`。完整 90 天导出只从同步页启动，并 `BGTaskScheduler.submit(BGProcessingTaskRequest)`。系统给的窗口以 `expirationHandler` 为准，不假设固定 15 分钟。
5. **处理任务：** 新预算 `processing`（`maxBatches` 放宽，时长跟系统走）。到期时停在日边界：该日 outbox 未空则不 checkpoint，下次续 drain。
6. **时间段重传：** `skipGlobalCheckpoint: true`，只对该窗 drain + 标脏（服务端 upsert 已标脏）。可选 `POST /health/sync/rollup` 提醒立刻算这几天（见 §5.3）。

不改：90 天常量、空日也 checkpoint、幂等 `(owner, hk_uuid)`、gzip、outbox ACK 语义。

---

## 5. 服务端：存要快，算要挪走

### 5.1 上传请求（热路径）

保持现有 7 个 upsert 端点，避免合成一个大包（超时、难续传、难拆失败）。

每个 upsert：校验 → 去重 hk_uuid → `INSERT ON CONFLICT` → **把返回的 `local_dates` 写入脏表** → 提交。禁止在这里调用 `recompute_daily_metrics`。

`POST /health/sync/checkpoint`：只 `_advance_sync_state`。不再重算 `to_at` 与前一天。

`POST /health/sync/runs`：只插 `health_sync_run`。success 时仍可推水位（与 checkpoint 取 max）。**不再**按 `local_dates` 重算。

### 5.2 脏日期

新表 `health_metrics_dirty`：

| 列 | 说明 |
|----|------|
| `owner_user_id` + `local_date` | UNIQUE |
| `timezone` | 最近一次写入用的时区 |
| `created_at` | |

清除健康数据时一起删。

### 5.3 汇总 job

`python -m app.jobs.health_rollup`，cron 每分钟（与规划提醒一样装到 `/etc/cron.d`）。

- 每次最多处理 N 个脏日期（建议 20），按 `local_date` 升序，避免首次 90 天一次打满 CPU。
- 重算成功再删脏行。
- 可选：`POST /health/sync/rollup` `{ dates?: string[], timezone }`，同步处理最多 3 天（给重传/当天），其余仍归 job。超时短。没有 Celery。

### 5.4 重算必须改写法（这是「服务端算太多」的修复）

按 metric **分别**查询，禁止再 `SELECT` 三天窗内全部 `health_sample_quantity`。

| 列 | 算法 |
|----|------|
| `hr_min/avg/max/count` | SQL `min/avg/max/count(*)`，`metric_type=heart_rate`，按日 bounds |
| `spo2_*` | 同上，血氧 |
| `resting_hr_bpm` / `body_mass_kg` / `vo2_max` / `cardio_recovery` | `ORDER BY start_at DESC LIMIT 1` |
| `hrv_median_ms` | 只拉当天 `hrv_sdnn` 的 **value 列**（一天通常很少条） |
| 累计型 | **只拉该 metric 当天（外加跨日边界一小段）的 start/end/value**，再跑现有 `sum_cumulative_deduped` |
| 睡眠 / 站立小时 | 维持现逻辑，表本来就小 |

这样心率 1 万点只做一次聚合扫描，不进 ORM。实现后 checkpoint 不再碰它；job 里也要走新实现。

### 5.5 上传侧其它瘦身

- 路线仍须 live workout；找不到保持 `400 workout_not_found`（所以客户端顺序不能乱）。
- 不在本期做 protobuf / 二进制协议。
- 不在本期做「服务端 UUID 清单让客户端跳过」。

---

## 6. 断点与时间段重传

### 6.1 断点（已有，收紧规则）

| 失败点 | 续上什么 |
|--------|----------|
| 导出到一半 | 该日未 checkpoint，整日重导出（HK 便宜过协议状态机） |
| 入队后进程死 | outbox 还在；`uploading` → `pending` |
| HTTP 5xx / 超时 | 行回 pending |
| 4xx 校验 | `failed`，不挡后续日水位（保持现语义） |
| 日 drain 完、checkpoint 前死 | 该日会重传；upsert 幂等 |
| checkpoint 已成功、rollup 未跑 | 水位已进，日表稍后出现；不重传 |

首次 90 天：第 1 天 checkpoint 成功后水位非空，之后 Observer 也可以 drain 剩余 outbox。这是「首次也能后台接着传」的关键，不必等 90 天全部 checkpoint。

### 6.2 选择时间段重传（新）

- iOS：`syncWindow(from: startOfDay(from), to: endOfDay(to), skipGlobalCheckpoint: true)`。
- 仍按日切、仍走 outbox、仍 gzip。
- 服务端：普通 upsert（覆盖）+ 标脏；job 或 `/rollup` 更新这些天的日表。
- 锚点：不重置。这段里的删除靠以后增量锚点，不靠时间窗。
- 水位：不回拨。若 `to > last_synced_at` 且这是「补尾巴」而不是任意历史重传，也不要因为重传昨天而把水位改到昨天。

---

## 7. Web 展示（和同步解耦）

不改卡片指标含义。改「数据还没齐时」的行为：

| 表面 | 数据源 | 同步未完成时 |
|------|--------|----------------|
| 近期训练 | `health_workout_session` | 有一行出一行 |
| 训练详情信封 | session 摘要列 | 立刻 |
| 训练地图 | route | 无则整块不渲染 |
| 训练心率曲线 | 窗口内 `heart_rate` | 无点不画图，不挡信封 |
| 现状卡片 / 7·30·90 | `health_metrics_daily` | 无行「—」；脏日期可加「汇总中」 |
| 指标下钻 | 样本 | 随 P2/P3 到达 |

`GET /views/me/health` 可带 `rollup_pending_days: int`（该用户脏表行数），便于壳层提示。不做 Web 端重算原始样本。

---

## 8. API 变更（尽量少）

| 方法 | 路径 | 变更 |
|------|------|------|
| 现有 upsert / deletions | 同路径 | 响应仍 `upserted + local_dates`；服务端多写 dirty |
| `POST /health/sync/checkpoint` | 同 | **去掉**重算 |
| `POST /health/sync/runs` | 同 | **去掉**重算 |
| **新** `POST /health/sync/rollup` | | 可选 `dates`（≤3）；返回 `rolled` / `remaining_dirty` |
| `GET /views/me/health` | | 增加 `rollup_pending_days` |
| `GET /health/sync-status` | | 可加 `dirty_days` 供调试，非必须 |

错误码沿用：`batch_too_large`、`invalid_timezone` 等。rollup 日期过多 → `400 too_many_dates`。

---

## 9. 遥测（用来验证第 1 轮的判定）

Client（已有 logger 上补字段）：`export_ms`、`upload_ms`、`batch_rows`、`batch_bytes`、`priority`（p0–p4）、`outbox_pending`、`bg_budget_hit`、`processing_expired`。

Server：`ingest_ms`、`row_count`、`dirty_insert_ms`；job：`rollup_ms`、`date`、`hr_sql_ms`、`cumulative_ms`。

**不要**在热路径打每条样本的 debug。

---

## 10. 明确不做

- 缩短 90 天。
- Android / Health Connect。
- 直播心率。
- 客户端按服务端 UUID 跳过。
- 把日表改成 iOS `HKStatisticsQuery` 为真相源。
- 七个 upsert 合成一个 multipart。
- Celery / Redis 队列。
- 训练心率单独存一份。
- Web 发起重传（没有 HealthKit）。

---

## 11. 分期（实现顺序）

每期可单独上线、单独回滚。

### P0 — 热路径去掉重算 + SQL 化 rollup

- dirty 表 + migration。
- upsert 标脏；checkpoint / finishRun 不再 `recompute_daily_metrics`。
- 重写 `recompute_daily_metrics` 分类型查询；job `health_rollup`；cron。
- 测试：现有「checkpoint 才出日表」改为「rollup 之后出日表」；ingest 后 dirty 存在、日表未改。

### P1 — 展示优先排队 + 更大数量批

- iOS enqueue 按 P0–P4 拆；drain 波次改顺序。
- quantity batch 1000。
- 训练应在同日心率之前到达服务端（集成测试可用 fake store）。

### P2 — 首次后台处理任务

- `BGProcessingTask` 标识、Info.plist、授权/点同步时 `submit`。
- Observer：nil 水位只 drain 不导出。
- 处理任务里跑与前台相同的 `syncFromWatermark`。

### P3 — 选择时间段重传

- 同步页日期范围；`skipGlobalCheckpoint`。
- 可选立刻 `POST /rollup` 那几天。

### P4 — Web 提示

- `rollup_pending_days`；训练详情已空曲线不渲染（现状大体已是）。

---

## 12. 测试要点

**服务端**

- upsert 不改变 `health_metrics_daily`，只插 dirty。
- job 处理后日表与如今算法对同一组累计样本一致（golden：重叠步数）。
- 心率 1 万点的 rollup 不把 1 万行 load 进 identity map（可用 query 计数或 explain 断言无全列 SELECT *）。
- checkpoint 后 `last_synced_at` 前进且不写日表。
- 清除数据删 dirty。
- `/rollup` 超过 3 天 → `too_many_dates`。

**iOS**

- 同日 outbox：workouts id 小于 heart_rate 批次。
- nil 水位 + 空 outbox：background 入口 0 次 HK 导出。
- nil 水位 + pending outbox：只 drain。
- 时间段重传不调用会回拨水位的 checkpoint。
- 杀进程：uploading → pending，ACK 行不在。

**真机**

- 90 天首次：记下 export_ms / upload_ms / 首条训练在 Web 出现的时间 / 卡片出现的时间。
- 对照改前：若 upload_ms 降、export_ms 仍高 → 量在 HK；若 checkpoint 消失后总墙钟降很多 → 确认是服务端重算。

---

## 13. 关键文件

| 文件 | 角色 |
|------|------|
| `app/models/health.py` | `HealthMetricsDirty` |
| `app/migrations/versions/0033_health_metrics_dirty.py` | 新表 |
| `app/services/health_api.py` | 去掉热路径重算；分类型 recompute；标脏 |
| `app/jobs/health_rollup.py` | cron job |
| `app/routes/health.py` | 可选 `/sync/rollup` |
| `HealthSyncService.swift` | 优先级入队；skipCheckpoint；处理任务循环 |
| `HealthSyncDrain.swift` | 波次顺序 |
| `HealthBackgroundDelivery.swift` | nil 水位只 drain |
| `HealthSyncView.swift` | 日期范围；提交 BGProcessing |
| `app/services/views/my_health.py` | `rollup_pending_days` |

---

## 14. 和上一份性能 spec 的关系

[2026-09-05-health-sync-performance-design.md](./2026-09-05-health-sync-performance-design.md) 里的 gzip、outbox、锚点、部分索引 **已经落地，保留**。

本方案改的是那份里没做完或做错位置的部分：

- 「checkpoint 仍同步重算」→ 彻底离开热路径。
- 「首次无水位则后台禁止」→ 改为禁止 **导出**，允许 **drain**，并用系统处理任务跑完 90 天。
- 「类型内并发 4、Group A 平行」→ 改为展示优先的波次，避免心率堵住训练。
- 新增时间段重传。
- 重算改为分类型 SQL，而不是 3 天全量 ORM。
