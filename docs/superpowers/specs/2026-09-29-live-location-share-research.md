# 多人实时位置共享调研（含方向 / 配速 / 爬坡 / 海拔）

**Date:** 2026-09-29  
**Type:** Research / design spike（不落地实现）  
**Scope:** 调研 Timia 内「多人实时位置共享」是否可行、与现有域如何划界、遥测字段如何建模、传输与客户端采集路径  
**Out of scope:** 本期不写代码、不做 Alembic、不引入 Redis/WebSocket；不做导航路线规划、Find My 式全网好友追踪、Android

---

## Goal

回答四个问题：

1. Timia **今天已有什么**可复用，**缺什么**才能做多人实时位置共享。
2. 行业常见做法与 Timia 架构的契合点。
3. **方向、配速、爬坡、海拔**等运动遥测在实时共享场景应如何定义与采集。
4. 若要做，推荐的产品边界、数据模型、传输分层与分期。

---

## Executive summary

| 结论 | 说明 |
|------|------|
| **绿场功能** | 无 live-share 规格、无会话表、无高频位置写入、无 WebSocket/SSE/pubsub |
| **可复用** | MapLibre / MapKit 地图壳、`haversine_m` / `mean_grade`、WGS-84 + 国内 GCJ 显示、日程任务钉（语义不同） |
| **禁止混用** | 不能挂在 `health_*` 或便利贴个人 GPS 上对外共享；健康域明确「不进 workspace」 |
| **推荐域** | 新协作域 `live_share`（或 `presence`）：显式同意、TTL、可撤销；可选 workspace 作用域或邀请令牌 |
| **遥测** | 设备侧上报 `lat/lng/alt/course/speed`；服务端派生配速、瞬时坡度、累计爬升；heading ≠ course 需约定 |
| **传输** | 一期可用短轮询 + 批量 POST；真实时需 Redis pub/sub + WebSocket/SSE（MVP 曾明确推迟） |
| **主采集端** | iOS `CLLocationManager` 连续定位；Web 浏览器 Geolocation 为只读跟随或弱上报 |

---

## 1. Timia 现状盘点

### 1.1 三类「位置」语义（不要混）

| 领域 | 语义 | 谁可见 | 是否连续 | 关键路径 |
|------|------|--------|----------|----------|
| 任务 / 日程地图 | 任务钉点（名称 + 可选坐标） | 工作空间 / 项目成员 | 否（静态） | `items.location_*`，`GET /views/schedule/map`，Web MapLibre / iOS MapKit |
| 便利贴 | 写下瞬间的一次性 GPS | 仅本人（他人 404） | 否（one-shot） | `sticky_notes.location_*`，`navigator.geolocation.getCurrentPosition` / `CLLocationManager.requestLocation` |
| 健康训练路线 | 事后 HealthKit 轨迹 + 配速/海拔汇总 | 仅本人 | 否（训练结束后同步） | `health_workout_session`，`health_workout_route.points[{t,lat,lng,alt?}]` |

规格依据：

- 任务地图：`2026-09-15-web-task-location-map-design.md`（明确 out of scope：导航、live tracking）
- 健康：`2026-08-27-health-domain-design.md`（out of scope：工作空间共享健康；手表逐跳直播）
- 总设计：`2026-04-23-timia-design.md`（MVP non-goal：WebSocket/SSE）

### 1.2 已有运动指标（事后，非直播）

| 指标 | 现状 | 来源 |
|------|------|------|
| 平均配速 `avg_pace_sec_per_km` | 有 | HealthKit → `health_workout_session` |
| 累计爬升 / 下降 `elevation_*_m` | 有 | HealthKit |
| 路线点海拔 `alt` | 有（可选） | `health_workout_route` |
| 平均坡度 `mean_grade` | 有（服务端从路线派生） | `workout_metrics.mean_grade` = ΣΔalt / Σhoriz |
| 配速分区 / 分段 | 有 | `workout_metrics` + workout detail views |
| **航向 / 方位角 heading / course** | **无** | 未存、未算 |
| **实时速度 / 实时配速** | **无** | 仅历史训练场均 |

可复用纯函数：`haversine_m`、`mean_grade`（`codes/core-service/app/services/workout_metrics.py`）。实时场景需要**短窗口瞬时坡度**，不能直接拿整段 `mean_grade`。

### 1.3 实时基础设施

| 组件 | 状态 |
|------|------|
| FastAPI HTTP + Postgres | 生产路径 |
| Redis / Celery / NATS | 无 |
| WebSocket / SSE 业务通道 | 无（MCP Streamable HTTP 是 Agent 协议，不是 presence） |
| `notification-service` | `docker-compose` 注释占位，无代码 |
| iOS Live Activity | 本机锁屏日程/同步状态；无远程推送 Live Activity |
| Web `BroadcastChannel` | 仅同浏览器 tab 鉴权同步 |

**结论：** 多人实时共享在 Timia 是新产品 + 新传输；地图与几何工具是显示层复用，不是业务复用。

---

## 2. 行业参考（模式提炼）

调研对象：Roadnik（开源自托管 room）、GroundWave（Socket.IO + PostGIS）、Pathfinder-live（教学用 WebSocket fan-out）、GeoHub（HTTP log + long-poll live）。

### 2.1 共同模式

1. **房间 / 会话**：共享密钥或邀请码；多人往同一会话写点。
2. **位置载荷**：`lat, lng, alt?, heading/bearing?, speed?, accuracy?, recorded_at`。
3. **扇出**：服务端校验 → 写库/写内存 → 广播给同房间订阅者。
4. **轨迹**：可选保留近期 polyline（按点数或 TTL 裁剪）。
5. **隐私**：无账号 room（Roadnik）或鉴权 + 会话级同意（产品向）。

### 2.2 与 Timia 的差异

| 开源/参考 | Timia 约束 |
|-----------|------------|
| 匿名 nickname + room key | 已有用户体系与 workspace 成员；更适合「登录用户 + 显式会话」 |
| 浏览器 Geolocation 足够 | 运动场景需要后台 GPS；Timia 强项在 iOS |
| 直接广播心率等健康字段 | 健康域禁止 workspace 共享；实时共享应独立同意，不读 `health_*` 表给他人 |
| 单机 Map 扇出 | 生产需水平扩展时要 Redis pub/sub |

---

## 3. 遥测字段定义（方向 / 配速 / 爬坡 / 海拔）

### 3.1 设备可直接给的（iOS `CLLocation`）

| 字段 | 含义 | 单位 | 备注 |
|------|------|------|------|
| `latitude` / `longitude` | WGS-84 坐标 | ° | 库内与任务/健康一致；中国显示层再转 GCJ |
| `altitude` | 海拔（椭圆体/相对，系统相关） | m | 消费级 GPS 噪声大；展示需平滑 |
| `horizontalAccuracy` | 水平精度半径 | m | 过滤劣质点 |
| `verticalAccuracy` | 垂直精度 | m | 过滤劣质海拔 |
| `course` | **运动方向**（相对正北顺时针） | ° 0–359.9，负值无效 | 移动中才可靠；静止时无效 |
| `speed` | 地速 | m/s，负值无效 | 派生配速的主输入 |
| `timestamp` | 定位时刻 | UTC | 必须带客户端时间，防乱序 |

**方向约定：**

- 对外字段名建议用 **`course_deg`**（运动朝向），不要混用「罗盘 heading」。
- 若产品要「手机朝向」才用 `CLHeading.trueHeading`；跑步/骑行共享默认 **course**。
- Web `GeolocationCoordinates` 同样有 `heading` / `speed` / `altitude`（浏览器命名的 heading ≈ course）。

### 3.2 应服务端或客户端派生的

| 指标 | 公式 / 规则 | 实时注意 |
|------|-------------|----------|
| 瞬时配速 | `pace_sec_per_km = 1000 / speed_mps`（speed>阈值） | 低速截断（如 <0.5 m/s 显示「—」）；跑步用 sec/km，骑行可改用 km/h |
| 平均配速（会话） | 累计距离 / 累计移动时间 | 与健康域 `avg_pace_sec_per_km` 对齐语义，但表独立 |
| 瞬时坡度 | 短窗 ΣΔalt / Σhoriz（如最近 30–60 s 或 50–100 m） | 复用 `mean_grade` 思路；窗太短会被 GPS 噪声打爆 |
| 累计爬升 | 对平滑后的正 Δalt 求和 | 应用阈值（如 Δalt≥1 m）抑制抖动 |
| 相对队友方位 | 双方最新点的 bearing（正北顺时针） | 地图箭头 / 「对方在你左前方」 |
| 直线距离 | `haversine_m` | 已有实现 |

### 3.3 建议实时上报 payload（单点）

```json
{
  "recorded_at": "2026-09-29T14:00:00.000Z",
  "lat": 31.2304,
  "lng": 121.4737,
  "alt_m": 12.5,
  "accuracy_m": 5.0,
  "vertical_accuracy_m": 8.0,
  "course_deg": 247.5,
  "speed_mps": 3.2,
  "battery_pct": 64
}
```

服务端可回填派生（也可客户端算后上报，但**以服务端校验为准**）：

```json
{
  "pace_sec_per_km": 312.5,
  "grade": 0.02,
  "ascent_m_session": 48.0,
  "distance_m_session": 3200.0
}
```

**刻意不放入一期共享 payload：** 心率、步频、功率、HealthKit UUID——避免把实时共享做成「健康直播」，也避开健康域边界。

### 3.4 采样与节流建议

| 场景 | 上报频率 | 理由 |
|------|----------|------|
| 步行 / 慢跑 | 2–5 s 或位移 ≥8–15 m | 平衡电量与地图流畅 |
| 骑行 | 1–3 s 或位移 ≥20–30 m | 速度高，稀疏会跳点 |
| 静止 | 15–30 s heartbeat | 确认在线，不刷无效点 |
| 精度差（accuracy > 50 m） | 丢弃或降权 | 防飞点 |

上限：每用户约 **1 Hz 封顶**；会话级 rate limit（对齐 `/geo/places` 的限流思路）。

---

## 4. 产品与域边界建议

### 4.1 推荐：独立 `live_share` 域

```
Workspace? ──可选──▶ LiveShareSession ──▶ LiveShareParticipant
                           │
                           ├─ latest_position（热）
                           └─ track_points（温，TTL 裁剪）
```

| 决策 | 推荐 | 理由 |
|------|------|------|
| 归属 | **新表 / 新路由**，不进 `health_*`、不进 sticky | 健康禁止共享；便签是个人 one-shot |
| 作用域 | **A)** workspace 成员会话；或 **B)** 邀请链接（可跨空间） | A 贴合 Timia 协作；B 贴合户外临时组队。一期建议 **B 邀请令牌 + 可选绑定 workspace** |
| 同意 | 每人主动「开始共享」；可随时停止；会话 TTL（如 2–8 h） | 位置是高敏感数据 |
| 与日程地图关系 | **人层与任务钉分层**；可同屏不同 layer | 任务钉 = 事；共享点 = 人 |
| 结束后 | 默认**删除或匿名化**轨迹；可选「保存为我的训练」另走健康同步 | 避免默认变成监控档案 |
| MCP | 最多只读会话状态；禁止连续位置工具 | 防 Agent 泄露行踪 |
| 活动日志 | 只记「创建/结束会话」类粗事件，不写每个坐标 | 对齐健康「明细不进 activity_log」精神 |

### 4.2 明确不做（一期）

- 把 `health_workout_route` 实时推给同事  
- Find My 式常开后台追踪  
- 无同意的 workspace 全员可见位置  
- Web 后台持续定位（浏览器限制大）  
- 导航 turn-by-turn、路网吸附（可后期接 OSRM 等）

---

## 5. 架构分层建议

### 5.1 写入路径（高频）

```
iOS CLLocationManager (background)
        │  batch POST /live-shares/{id}/positions
        ▼
core-service
  · auth + session membership
  · validate + rate limit
  · upsert participant.latest_*
  · append track (cap N points / TTL)
  · publish "position" event ──▶ Redis channel（二期）
        │
        ├── WebSocket/SSE subscribers（二期）
        └── 或短轮询 GET snapshot（一期）
```

### 5.2 一期 vs 二期传输

| 期 | 传输 | 延迟目标 | 依赖 |
|----|------|----------|------|
| **P0 可验证** | `POST` 批量点 + `GET` 会话快照（1–3 s 轮询） | ~2–5 s | 仅 Postgres；与 MVP「无 WS」一致 |
| **P1 真实时** | WebSocket 或 SSE + Redis pub/sub | <1 s | 新依赖；可落在预留的 notification 槽或 core 内嵌 |
| **P2** | APNs 推送更新 Live Activity「正在与 N 人共享」 | 锁屏可见 | 当前 Live Activity 规格明确不做远程推送，需另开 spec |

### 5.3 客户端职责

| 端 | 职责 |
|----|------|
| **iOS** | 主上报端：连续定位、后台模式、电量自适应、地图人层、共享开关与倒计时 TTL |
| **Web** | 主跟随端：地图看队友、选中看配速/海拔/方向；可选前台弱上报（tab 活跃时） |
| **core** | 会话 CRUD、权限、限流、派生指标、快照/扇出 |
| **MCP** | 默认不暴露；若要做仅 `list_my_live_sessions` 类元数据 |

### 5.4 与现有地图代码的挂点

- Web：`lib/map/osmStyle.ts`、`ScheduleMapCanvas` / `WorkoutRouteMap` 模式 → 新人层 component，不把人当成 task pin  
- iOS：`ScheduleMapView` 旁路或独立 `LiveShareMapView`；复用 `ChinaCoordinate`  
- 几何：把 `haversine_m` / 短窗 grade 抽到可被 live_share 与 health 共用的小模块（避免 live 依赖 health 包）

---

## 6. 数据模型草稿（供后续 spec 细化）

### 6.1 `live_share_session`

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | UUID PK | |
| `created_by` | UUID → users | |
| `workspace_id` | UUID 可空 | 可选绑定 |
| `title` | VARCHAR | 「周六长跑」 |
| `invite_token_hash` | VARCHAR | 邀请码哈希 |
| `status` | `active` / `ended` | |
| `starts_at` / `ends_at` | timestamptz | TTL |
| `retention` | `ephemeral` / `keep_for_owner` | 默认 ephemeral |

### 6.2 `live_share_participant`

| 列 | 类型 | 说明 |
|----|------|------|
| `session_id` + `user_id` | 唯一 | |
| `role` | `host` / `member` | |
| `sharing` | bool | 是否正在上报 |
| `display_name` | 快照 | |
| `last_lat/lng/alt/...` | 最新点热字段 | |
| `last_course_deg` / `last_speed_mps` | | |
| `last_pace_sec_per_km` / `last_grade` | 派生缓存 | |
| `ascent_m` / `distance_m` | 会话累计 | |
| `last_seen_at` | | 离线判定 |

### 6.3 `live_share_track_point`（可选温存）

`(session_id, user_id, recorded_at, lat, lng, alt_m, course_deg, speed_mps, …)`  
索引：`(session_id, user_id, recorded_at DESC)`；定时裁剪或会话结束删除。

高频点也可用 **Redis 热 + Postgres 抽样冷**；一期全 Postgres 可接受（会话短、人数小）。

---

## 7. API 草图

| Method | Path | 说明 |
|--------|------|------|
| `POST` | `/live-shares` | 创建会话（TTL、标题、可选 workspace） |
| `POST` | `/live-shares/join` | 邀请码加入 |
| `POST` | `/live-shares/{id}/sharing` | 开关本人上报 |
| `POST` | `/live-shares/{id}/positions` | 批量点（≤50/次） |
| `GET` | `/live-shares/{id}/snapshot` | 全员 latest + 可选短轨迹 |
| `POST` | `/live-shares/{id}/end` | 结束（host） |
| `DELETE` | `/live-shares/{id}/me` | 退出并停止共享 |

鉴权：与现有 Web JWT / iOS device session 一致。邀请码加入仍需登录用户（弃用纯匿名），便于审计与封禁。

---

## 8. 风险与开放问题

| 风险 / 问题 | 影响 | 倾向 |
|-------------|------|------|
| 后台定位审核（iOS Always） | App Store 文案与用途证明 | 用途限定「用户主动发起的临时活动共享」；设置页清晰开关 |
| 海拔 / 坡度噪声 | 误导用户 | UI 显示精度提示；坡度用短窗 + 平滑；差垂直精度时隐藏 grade |
| 国内地图坐标 | 人点飞偏 | 沿用任务/训练的 WGS 存、GCJ 显 |
| 电量 | 用户关掉共享 | 位移阈值 + 自适应间隔；Live Activity 提示「共享中」 |
| 法律 / 隐私 | 未同意可见 | 默认 ephemeral；结束清轨迹；不进 MCP |
| 是否与「一起训练」绑定 | 产品范围 | 建议独立；日后可「共享结束后可选生成个人训练记录」 |
| 传输一期是否硬上 WS | 工期与运维 | **先轮询验证产品**；WS 单独立项（触及 2026-04-23 non-goal） |
| 人数上限 | 扇出成本 | 一期建议 ≤20 人/会话 |

### 待产品确认

1. 主场景：户外组队运动 vs 工作日「我在路上」报到 vs 两者？  
2. 作用域：仅 workspace 内，还是邀请码可拉外部账号？  
3. 共享指标最小集：只要位置箭头，还是必须配速+海拔+爬坡同屏？  
4. 结束后轨迹：一律销毁，还是允许发起人导出 GPX（仅本人）？

---

## 9. 建议分期

| 阶段 | 交付 | 验证 |
|------|------|------|
| **R0 本调研** | 本文档 | 评审域边界与指标定义 |
| **P0 Spike** | 会话表 + POST/GET 快照 + iOS 前台连续定位 + Web 地图人层（配速/course/alt 只读） | 2 人同地图延迟 <5 s |
| **P1** | 后台定位、TTL/撤销、短窗坡度与累计爬升、轨迹残影 | 户外实测电量与海拔噪声 |
| **P2** | WebSocket/SSE + Redis；可选 Live Activity 远程态 | 延迟 <1 s；多实例 fan-out |
| **P3** | 路网吸附、相对方位提示、结束后个人 GPX | 按需 |

---

## 10. 文件索引（调研依据）

**规格：**  
`docs/superpowers/specs/2026-09-15-web-task-location-map-design.md`  
`docs/superpowers/specs/2026-09-18-ios-schedule-map-design.md`  
`docs/superpowers/specs/2026-08-27-health-domain-design.md`  
`docs/superpowers/specs/2026-08-30-workout-detail-design.md`  
`docs/superpowers/specs/2026-04-23-timia-design.md`  
`docs/technical-solution/sticky-notes.md`  
`docs/technical-solution/health-data-and-sync.md`

**实现锚点：**  
`codes/core-service/app/services/workout_metrics.py`（`haversine_m` / `mean_grade`）  
`codes/core-service/app/models/health.py`（事后路线点形状）  
`codes/core-service/app/routes/geo.py`（Photon 代理限流模式）  
`codes/web/src/components/schedule/ScheduleMapCanvas.tsx`  
`codes/web/src/components/health/WorkoutRouteMap.tsx`  
`codes/mobile/ios/Timia/Features/Schedule/ScheduleMapView.swift`  
`codes/mobile/ios/Timia/Features/StickyNotes/`（one-shot GPS，非连续）

---

## Decisions（调研倾向，待确认后写入正式设计）

| Topic | Tentative choice |
|-------|------------------|
| 域 | 新建 `live_share`，不复用 health / sticky / item pins |
| 同意模型 | 主动加入 + 主动开启共享 + TTL + 可撤销 |
| 方向 | `course_deg`（运动朝向），非罗盘 |
| 配速 | 由 `speed_mps` 派生 `pace_sec_per_km`；低速显示「—」 |
| 海拔 / 爬坡 | 上报 `alt_m`；短窗 `grade` + 会话 `ascent_m` 服务端算 |
| 传输一期 | HTTP 批量写 + 快照轮询；WS 二期 |
| 地图 | 人层独立；可叠在日程地图但不混任务语义 |
| 健康数据 | 实时共享 payload **不含**心率等；不读他人 `health_*` |
