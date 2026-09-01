# 训练记录与日程关联设计

**Date:** 2026-08-31  
**Branch:** 实现时从当时的健康功能分支拉出  

**Depends on:** [2026-08-27-health-domain-design.md](./2026-08-27-health-domain-design.md)、[2026-08-17-plan-domain-design.md](./2026-08-17-plan-domain-design.md)、[2026-08-30-workout-detail-design.md](./2026-08-30-workout-detail-design.md)  
**Scope:** 健康训练记录与「我的日程」任务的核销 / 补记；多套训练规划共用一套健康记录；补记目标空间/项目（「近期训练」标题右侧二级选择，未选则自动创建「健康 / 训练记录」）  
**Out of scope:** 按课表目标对比配速或组数；根据实际训练改下周课表；把健康明细写入工作空间或 `activity_log`；iOS 待办 / 设置 / 日程徽标；Android；静默自动导入下一周期规划（规划域现有「确认才导入」不变）；把任意日程任务（开会、杂事）纳入匹配

训练详情里「选择课表与课表目标」原先划在范围外；本 spec 只做「实际训练 ↔ 日程任务」关联，不做课表目标达成度。

## Goal

用户不必再把随机跑步或力量训练手填进日程。HealthKit 训练同步后：能对上已有日程任务则**核销那一条**（不出现第二条）；对不上则在选定项目里**自动生成一条已完成任务**。规划模板**不增加开关或新字段**：订阅时选的空间/项目是课表任务落点，「近期训练」选的空间/项目是补记落点，匹配靠落点是否同一项目、以及任务标题是否像训练。力量、跑步、康复可以同时订；健康记录仍是一套。规划仍负责「打算练什么」；健康仍是事实源；日程上一次训练最多一条主任务。

## Decisions (confirmed)

| Topic | Choice |
|-------|--------|
| 策略 | **C：先核销课表，核销不上再补记** |
| 事实源 | `health_workout_session`；不把轨迹 / 心率 / 负荷拷进 `items.body` |
| 关联载体 | 新表 `health_workout_link`（个人域）；`items` 不增加 `source_health_workout_id` |
| 规划侧 | **不加开关、不加槽位类型。** 订阅时的空间/项目与「近期训练」的空间/项目即落点 |
| 候选任务 | 补记目标项目内的任务 + 任意项目里标题能识别为训练的任务。见 §3.1 |
| 错放项目 | 标题能识别为训练（如「跑步」）则仍可自动核销。标题无法识别时，训练详情可手动绑到自己负责的任意任务 |
| 核销后时间 | 默认把任务 `start_at` / `end_at` **改成实际训练时间**；规划时间快照在 link 上。设置可改为「位置不动，只标完成」 |
| 完成方向 | 仅训练 → 可把任务标 `done`。任务手勾完成 **不** 伪造健康训练 |
| 噪声 | 时长 &lt; 8 分钟；`cooldown` / `play`；步行 &lt; 15 分钟。仍留在健康页。`prep_recovery` 不当类型噪声 |
| 待办 | 中等置信不自动绑；Web 健康页处理。待办未决期间不补记第二条 |
| 回灌 | 只对 `schedule_link_enabled_at` 之后（含往前 48 小时）的训练补记；更早的只核销不新建 |
| 多课表 | 各课表任务与标题像训练的手建任务进入同一候选池。一对一贪心，跑核销跑、力核销力 |
| 补记去向 | 核销后任务留在原项目；补记一律写入「近期训练」选定的空间+项目 |
| 目标选择 UI | 「近期训练」标题右侧两级选择（先空间、后项目），做成标题行芯片 |
| 未选择时 | 找或创建自己拥有的工作空间「健康」，再找或创建其下项目「训练记录」 |
| 规划导入 | 每周确认才写入课表任务的规则不变 |
| 活动日志 | 核销 / 补记不调用 `log_activity`（与健康域一致，避免工作空间刷屏） |
| iOS 第一期 | 无新 UI；任务会出现在 iOS 日程里。补记目标用 Web 已选或 ensure 的「健康 / 训练记录」 |

---

## 1. 产品原则

1. **日程上一次训练最多一条主任务。** 热身 / 放松 / HealthKit 重复件挂在同一条下，不各建一条。
2. **健康是事实，规划是意图。** 有事实则核销或补记；没戴表则课表保持未完成。
3. **宁可不自动，不要绑错。** 高置信才自动核销；同日但时间差大的进待办。
4. **可撤销。** 取消关联、忽略、拆错后的否决对不会被立刻自动重新绑上。
5. **健康数据不出个人域。** 同事若看见任务，只能看到标题与时间，点训练详情对非本人 404。
6. **课表可以多套，健康记录只有一套。** 规划不加开关。匹配器看见：补记目标项目里的任务，以及任意项目里标题像训练的任务。补记只写「近期训练」指定的那一个日志项目。

---

## 2. 主路径

训练 upsert、训练删除、规划 `materialize_run` 成功后，对当事人跑同一套幂等关联器（`app/services/workout_schedule.py`）。匹配与打分是无 IO 纯函数，便于单测。

对每个未删除、未抑制的训练（先做重复件折叠与同组聚类，见 §5）：

| 结果 | 条件 | 日程 |
|------|------|------|
| **核销** | 高置信命中一条候选任务 | 不新建。任务标 `done`，`completed_at = workout.end_at`；按设置把时间改为实际；写入 `role=primary, status=linked, source=auto` |
| **待办** | 中等置信 | 不改任务、不补记。健康页出现一条待办 |
| **补记** | 无候选或低置信，且过噪声门槛，且训练结束时间在回灌窗口内 | 在 §6.3 目标项目新建 `status=done` 的任务，负责人=训练主人，标题见 §6.2 |
| **忽略** | 噪声、或用户已抑制、或窗口外且无课表可核销 | 只留在健康页 |

规划有、训练没有：任务保持 `todo`（或用户手勾 / 归档）。  
训练有、规划没有：走补记（随机跑、随机力量同一套）。

待办三个动作：

- **关联课表**：按核销处理，`source=user`
- **当作额外训练**：对该候选写入否决对，再走补记
- **只留在健康**：`status=suppressed`，不再为该训练建任务

---

## 3. 谁能被匹配

规划模板**不增加**「关联健康训练」开关，槽位也**不增加**活动类型。订阅规划时已经必须选空间和项目；健康补记也必须选空间和项目。这两次选择就是落点，用来圈候选，不再在课表上挂第二套开关。

### 3.1 候选任务

必须同时：`assignee_user_id = 训练主人`，任务仍存在，`status ≠ archived`，`start_at` 非空。`end_at` 为空时，匹配用 `start_at + 60 分钟` 当作结束（只用于算重叠，不改任务）。并且属于下列之一：

1. **落点相同：** `workspace_id` + `project_id` 等于当前补记目标（§6.3，即「近期训练」所选，或 ensure 出的「健康 / 训练记录」）。不论是课表导入的还是手建的。这就是「订阅选的项目」和「训练记录选的项目」对得上的那一层。
2. **标题像训练（不限项目）：** `title`（及 `body` 前 80 字）能推断出具体活动族（`run` / `walk` / `cycle` / `swim` / `strength` / `mind`，§4.2）。**不包括**仅命中 `wildcard`（训练、健身、锻炼）的标题——那些必须落在补记目标项目里才走规则 1。  
   因此：手建任务写了「跑步」却选错了工作空间，**仍然会核销**，不会因为项目不一致就放弃。
3. **已经补记过的任务：** 已有 `health_workout_link` 且 `source=auto`（再次同步时更新，不重建）。通常已在规则 1 的项目里。

「开会」「买菜」「英语」等：不在补记目标项目、标题也不像训练 → **不是候选**，即使时间重叠也不自动绑、不进待办。

训练详情里用户**手动**「记入日程」并指定任务时：可以绑到自己负责的任意任务（包括选错项目、标题也不像训练的）。这是逃生口，不走自动候选池。

### 3.2 多套课表 × 一套健康记录

健康同步不区分「这条属于哪张课表」。力量、跑步、康复可以分别订到不同项目，也可以订到与补记目标相同的「健康 / 训练记录」。

- 订到**与补记目标相同**的项目：该项目下当天所有课表任务都是候选（规则 1），标题叫「下肢」或只叫「训练」都可以参与打分。
- 订到**别的**项目：只要标题能识别为力量/跑步/康复等（规则 2），仍进入同一候选池，照样一对一核销。标题完全无语义（如「A1」「第三节」）且又不在补记目标项目 → 自动匹配不到；可改标题、把课表订进补记目标项目，或在训练详情手动绑定。

同一自然日可以同时有「下肢」「轻松跑」「髋部活动」。一条 `strength` 核销「下肢」，一条 `running` 核销「轻松跑」。靠 §4 窄族 + 一次贪心，不按课表分组、不先选课表。

课表任务留在各自订阅时的空间/项目。健康页的空间/项目选择**只影响补记**（对不上任何任务时新建的那条），不把已核销的课表任务搬过去。

两张课表同一晚都有课、实际只练了一次：分数高的被核销，另一条保持未完成。当天两张都叫「训练」且都在补记目标项目并重叠：wildcard 进待办，不自动两条都勾。

---

## 4. 匹配与打分

时区：训练同步 payload 的 timezone；规划导入场景用该次 apply 的 timezone（订阅则为 `plan_subscriptions.timezone`）；都缺则 `Asia/Shanghai`。「同一自然日」用该时区下训练 / 任务的 `start_at` 日历日。全天任务：该时区下开始为当日 00:00，且结束为当日 24:00 或次日 00:00。视为该日全天窗，`overlap = 1`。

### 4.1 活动族

**自动核销用窄族**（避免「跑步课表」被步行核销）：

| 窄族 | token |
|------|--------|
| `run` | `running`、`track_field` |
| `walk` | `walking`、`hiking` |
| `cycle` | `cycling`、`hand_cycling` |
| `swim` | `swimming` |
| `strength` | `strength`、`functional_strength`、`core_training`、`hiit`、`cross_training` |
| `mind` | `yoga`、`pilates`、`tai_chi`、`flexibility`、`mind_and_body`、`prep_recovery` |
| `exact` | 其余 token，只和完全相同的类型比 |

**待办用宽族**：`run` 与 `walk` 合并为 `cardio_foot`。其余同窄族。中等置信允许「晚上跑步课表 × 中午步行」进待办，不自动核销。

### 4.2 标题关键词

对任务 `title`（及 `body` 前 80 字）做包含匹配，大小写不敏感：

| 推断窄族 | 关键词（任一命中） |
|----------|-------------------|
| `run` | 跑步、慢跑、间歇跑、长距离、配速跑、jogging |
| `walk` | 步行、走路、徒步、hiking |
| `cycle` | 骑行、单车、公路车、功率骑 |
| `swim` | 游泳、泳 |
| `strength` | 力量、重量、卧推、深蹲、硬拉、下肢、上肢、HIIT、高强度、力量耐力 |
| `mind` | 瑜伽、普拉提、拉伸、太极、康复、理疗、物理治疗 |
| `wildcard` | 训练、健身、锻炼（且未命中上表） |

单字（跑、走、骑、游、推、拉）不做关键词，避免误伤。标题同时命中两族时取先匹配到的表中更靠上的一行。

### 4.3 分数

对每个（主训练，候选任务）计算，已否决对跳过。已有 `status=linked` 的任务不再接受第二条主训练。

```
overlap = 交集秒数 / min(训练时长, 任务时长)
start_delta = |workout.start_at − item.start_at|
```

全天任务：同一自然日则视为 `overlap = 1`。

| 条件 | 分 |
|------|----|
| `overlap ≥ 0.5` | +50 |
| 否则 `start_delta ≤ 90 分钟` | +35 |
| 否则同一自然日 | +15 |
| 窄族相同（标题关键词） | +30 |
| 仅宽族相同（跑×走） | +15 |
| `wildcard` 且 `overlap ≥ 0.5` | +10 |
| 任务已是 `done` | +5 |

判定按下面顺序，只取第一条命中：

1. **自动核销：** 窄族相同，且分数 ≥ 70  
2. **自动核销（wildcard）：** 任务为 `wildcard`，`overlap ≥ 0.5`，且该训练所在自然日进入候选池的任务恰好一条（其它课表当天没有课也算「恰好一条」）  
3. **待办：** 40 ≤ 分数 &lt; 70；或分数 ≥ 70 但只有宽族相同（跑×走）；或 `wildcard` 未走 2  
4. **不成对：** 其余

第 2 条是为了课表标题只写「训练」、又和真实课时间重叠时不要进待办。当天已有两条候选则 wildcard 最高只进待办。

### 4.4 一对一分配

同一批次里一个主训练只能核销一条任务，一条任务只能被一条主训练核销。候选来自多套课表时仍是**一次**贪心，不按模板分组再匹配（禁止「每个课表各核销一次」）。分数相同则 `start_delta` 更小者优先。未分到的训练再走待办（看次高分是否仍 ≥ 40）或补记。

---

## 5. 聚类、重复件、噪声

在打分之前处理。

### 5.1 HealthKit 重复件

同一 `owner_user_id`、未删除、窄族相同、`|start 差| ≤ 5 分钟`、`|时长差| / max(时长) ≤ 10%`：视为同一次。

主记录优先：`source_bundle_id` 含 `com.apple.health` 或 `watch` → 否则时长更长 → 否则 `created_at` 更早。重复件与卫星 **只在主训练变为 `linked` 之后** 落行（`role=duplicate` 或 `satellite`，`status=linked`，同一 `item_id`）。不为它们单独建任务或进待办。

### 5.2 同组（热身 + 主课 + 放松）

按 `start_at` 排序。若下一条 `start_at − 上一条 end_at ≤ 30 分钟`，收入同一组。

组内 **主训练** = 非噪声类型中时长最长的一条；并列则开始更早者。组内全是噪声则整组忽略。用主训练去匹配课表。组内其他训练在主训练 `linked` 后写 `role=satellite`。

跨组的两条力量（中间隔了 2 小时）不是一组，按两条主训练处理（可能一条核销课表、一条补记或待办）。

### 5.3 噪声（不补记、不单独进待办）

满足任一即噪声：

- `duration_seconds < 480`（8 分钟），设置可改 `schedule_min_duration_sec`
- `activity_type ∈ {cooldown, play}`
- `activity_type = walking` 且时长 &lt; `schedule_walk_min_duration_sec`（默认 900）

`prep_recovery` **不**再按类型一律丢弃：康复课可能被手表记成热身/恢复。仍受 8 分钟门槛约束。

噪声若属于某组卫星，只挂组、不补记。孤立噪声：忽略。

---

## 6. 写入日程

### 6.1 核销

对命中的候选任务，同一事务：

1. `status = done`（若已是 `done` / `archived` 则不改状态）
2. `completed_at = workout.end_at`（仅当本次把状态改为 `done`，或 `completed_at` 为空）
3. 若 `schedule_move_to_actual = true`（默认）：先把原 `start_at` / `end_at` 写入 link 的 `planned_start_at` / `planned_end_at`，再把任务时间改成训练起止
4. 不改 `title` / `body` / `color` / `priority` / `source_plan_*`
5. `version += 1`（与普通 PATCH 任务一致，避免抽屉覆盖冲突）

### 6.2 补记新建

| 字段 | 值 |
|------|----|
| `workspace_id` / `project_id` | §6.3 |
| `title` | 见下 |
| `body` | `来自健康训练`（固定一句，不写指标） |
| `status` | `done` |
| `completed_at` | `workout.end_at` |
| `start_at` / `end_at` | 训练起止 |
| `assignee_user_id` / `created_by_user_id` | 训练主人 |
| `color` | `#FFFFFF` |
| `priority` | `null` |
| `source_plan_*` | `null` |

标题：

- 有 `distance_m ≥ 100`：`{中文类型} {公里一位小数} 公里 · {分钟} 分钟`（例：`跑步 6.2 公里 · 32 分钟`）
- 否则：`{中文类型} · {分钟} 分钟`（例：`力量训练 · 49 分钟`）

分钟 = `round(duration_seconds / 60)`，至少 1。中文类型复用 Web `workoutActivityStyle().label` 的同一套映射，服务端放一份（`health_types` 或并列字典），禁止只在前端拼标题。

用户之后改标题：后续同步不覆盖。用户删任务：该训练 `status=suppressed`，不重建。

### 6.3 补记目标（空间 + 项目）

补记**不**使用课表订阅的项目。力量/跑步/康复课表各自导入到它们订阅时选的项目；对不上课表的训练全部写入**同一个**日志项目。

解析顺序：

1. `health_profiles.schedule_workspace_id` + `schedule_project_id` 均非空，项目属于该空间，用户仍有内容权限，项目未归档 → 用这对
2. 否则走 **ensure**：找或创建默认「健康 / 训练记录」，写回 profile，再用这对

**ensure 规则（幂等）：**

- 工作空间：在「当前用户为 `owner` 且 `name` 恰好为 `健康`」的空间里取 `created_at` 最早的一条。没有则 `create_workspace(name=健康)`，创建人=训练主人、角色 owner。不复用他人同名空间，即使自己是 member。
- 项目：在该空间内、未归档、`name` 恰好为 `训练记录` 的项目里取最早一条，且用户有内容权限。没有则创建项目（创建人 owner），名称 `训练记录`。
- 把得到的 id 写入 `schedule_workspace_id` / `schedule_project_id`
- 创建空间/项目走现有 service（成员行、权限与手动创建一致）。这一次允许 `log_activity`（一次性建档，不是每条训练）

调用时机（仅当 `schedule_link_enabled = true`）：

- `reconcile` 即将补记之前
- `GET /views/me/health`（保证打开健康页时选择器已有值，iOS 先同步、Web 后打开也一致）

总开关关闭时不 ensure、不新建空间；选择器仍显示已保存的 id（若有）。

profile 里的 id 指向已删/无权限的空间或项目：视为未选择，重新 ensure。

用户在「近期训练」改了选择：`PATCH /health/profile` 立刻保存。之后的补记用新项目；**已经补记或核销的任务不搬家**。换空间时：若新空间有「训练记录」则选它，否则选该空间下用户可写的最早创建项目；若一个项目都没有，在该空间创建「训练记录」（不再新建另一个「健康」空间）。

选择器不允许长期空着：Web 保存必须成对；服务端目标为空或失效时 ensure，不再用「缺项目待办」作为常规状态。仅当创建空间或项目在事务中失败时，该条训练跳过补记并记错误日志，下次同步再试。

自动创建的「健康」是普通工作空间，出现在侧栏「工作空间」里；用户可改名、可邀请成员。成员能看见补记任务的标题与时间，看不到健康明细。改名后仍用 profile 里的 id，不会因为名称不再叫「健康」就再 ensure 出一个新空间。

### 6.4 回灌窗口

`health_profiles.schedule_link_enabled_at`：总开关第一次变为开时写入 `now()`，之后关再开不改。列默认 `schedule_link_enabled = true`，但 **`enabled_at` 默认 null**。第一次 `reconcile` 时若开关为开且 `enabled_at` 为空，当场打戳为 `now()`（迁移不把该戳写成过去，避免 90 天历史被一次性补记）。

补记仅当 `enabled_at` 非空且 `workout.end_at ≥ enabled_at − 48h`。`enabled_at` 仍为空时不补记。核销不受此限（历史课表仍可打勾）。功能上线前已存在的近 90 天训练：只核销、不批量铺日程。

---

## 7. 数据模型

### 7.1 `health_workout_link`

个人域，命名对齐 `health_workout_session` / `health_workout_route`。用户删除时 `CASCADE`。

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | UUID PK | |
| `owner_user_id` | UUID FK users | |
| `workout_id` | UUID FK `health_workout_session` ON DELETE CASCADE | |
| `item_id` | UUID FK `items` ON DELETE SET NULL | 待办未确认前即候选任务 id |
| `role` | VARCHAR(20) | `primary` / `satellite` / `duplicate` |
| `status` | VARCHAR(20) | 见下 |
| `source` | VARCHAR(20) | `auto` / `user` |
| `score` | FLOAT 可空 | |
| `planned_start_at` / `planned_end_at` | timestamptz 可空 | 核销前任务时间快照 |
| `created_at` / `updated_at` | | |

`status`：

| 值 | 含义 |
|----|------|
| `pending` | 待办，尚未改任务 |
| `linked` | 已核销或已补记 |
| `suppressed` | 用户不要进日程；`item_id` 空 |
| `rejected` | 否决这一对；匹配器跳过该（workout, item） |

约束与索引：

- `INDEX (owner_user_id, status)`
- `INDEX (workout_id)`
- `INDEX (item_id)` WHERE `item_id IS NOT NULL`
- **部分唯一**：同一 `workout_id` 最多一条 `role=primary` 且 `status IN ('pending','linked','suppressed')`
- **部分唯一**：同一 `item_id` 最多一条 `role=primary` 且 `status='linked'`
- `rejected` 行：`UNIQUE (workout_id, item_id)` 其中 `status='rejected'`

读路径：非本人 404，与其它 `health_*` 一致，不泄露存在性。

训练软删（`deleted_at`）：若关联的是补记任务（无 `source_plan_*`）→ 任务改为 `archived`；若是课表任务 → 删除该训练的 link 行，**不**把 `done` 改回 `todo`。卫星 / 重复件随主记录的 link 一起删。

### 7.2 `health_profiles` 增加日程偏好

| 列 | 默认 | 说明 |
|----|------|------|
| `schedule_link_enabled` | `true` | 总开关。关：不核销、不补记、不进待办 |
| `schedule_link_enabled_at` | null | 见 §6.4 |
| `schedule_min_duration_sec` | `480` | 1–7200 |
| `schedule_walk_min_duration_sec` | `900` | 1–7200 |
| `schedule_move_to_actual` | `true` | 核销后是否改任务时间 |
| `schedule_workspace_id` | null | FK workspaces ON DELETE SET NULL。补记目标空间 |
| `schedule_project_id` | null | FK projects ON DELETE SET NULL。补记目标项目 |

`PATCH /health/profile` 扩展这些字段。项目必须属于对应空间，且用户有内容权限，否则 `400 invalid_schedule_project`。第一次把 `schedule_link_enabled` 设为 true 且 `enabled_at` 为空时打戳（与第一次 reconcile 打戳相同，谁先谁写）。

空间/项目**不要**再放进侧栏基础信息。只在「近期训练」标题右侧选（§10）。侧栏「训练与日程」只保留：总开关、最短时长、步行最短时长、核销后是否改时间。

### 7.3 规划表

**不改。** 不加 `link_health_workouts`，不加槽位 `activity_type`。

---

## 8. 触发与幂等

在同一请求事务内、flush 训练或规划任务之后调用 `reconcile_workout_schedule(db, user_id, window_start, window_end)`。窗口 = 本批训练（或本批新建任务）的最早 `start_at − 3h` 到最晚 `end_at + 3h`，避免跨组截断。

额外触发：删除任务成功后，若存在该 `item_id` 的 link：补记任务被删 → 对应主训练改为 `suppressed`；课表任务被删 → 删除 link，训练下一轮按无课表处理（可补记，除非仍在待办窗口外）。

幂等：

- 已 `linked` 且训练 id、任务 id 未变：只按最新训练时间更新补记任务的起止（用户改过标题则仍不改标题）；课表核销任务仅当 `schedule_move_to_actual` 为 true 时跟随训练时间
- 已 `suppressed`：该训练不再核销、补记、进待办
- `rejected` 行本身不改；该训练仍可匹配其它候选或补记
- `pending` 且候选仍在、分数仍落在待办：保持待办，不升级为自动（避免待办闪成错误核销）
- `pending` 且候选已删除或已被另一训练 `linked`：待办作废，该训练重新走补记 / 新待办

不引入 Celery。不在健康 insight cron 里顺带跑全量。

---

## 9. API 与视图

只读走 `routes/views/`；写入走 `routes/health.py` 与既有 plan / profile 路由。错误码 snake_case。

### 9.1 写入

- `POST /health/workouts/{workout_id}/schedule-link`  
  `{ "action": "link_item", "item_id" }` 或 `{ "action": "materialize" }` 或 `{ "action": "suppress" }` 或 `{ "action": "unlink" }`  
  仅本人；`item_id` 必须仍是 §3.1 候选，或用户明确指定的、自己负责的任务。`unlink`：课表任务保持 `done`，去掉 link；补记任务改为 `archived`。
- `POST /health/schedule-inbox/{link_id}/resolve`  
  `{ "action": "confirm" | "materialize" | "suppress" }`  
  `confirm` = 核销 `item_id`；另两个同 §2。

### 9.2 视图

- `GET /views/me/health/schedule-inbox`  
  当前用户 `status=pending` 列表：训练摘要（类型、开始、时长、距离）+ 候选任务（id、title、start_at、end_at）。
- 训练详情 `GET /views/me/health/workouts/{id}` 增加可空 `schedule_link`：`item_id`、`item_title`、`role`、`status`、`source`。Web 用 `item_id` 打开任务抽屉。
- 任务抽屉详情增加可空 `health_workout`：`workout_id`、`activity_type`、时长、距离。非任务负责人不返回此块（避免工作空间成员靠任务探测他人健康 id；第一期只给负责人看）。
- `GET /views/me/health` 增加 `schedule_inbox_count`；并返回补记目标 `schedule_workspace_id`、`schedule_project_id` 及对应名称（供标题右侧选择器）。该 GET 在目标为空或已失效时调用 §6.3 ensure（写副作用仅限补 profile 空缺，不改训练）。未选过时响应里已是「健康 / 训练记录」。
- 规划域本功能不改模板 API 与编辑页。

OpenAPI 变更后 `make codegen`。

---

## 10. Web

- **健康页 · 近期训练标题行：** 左侧 `h2`「近期训练」；右侧两个紧凑选择器，先工作空间、后项目。交互对齐 `PinnedTagSelect`（可搜索、收藏置顶、可新建空间/项目），视觉是标题行芯片，不要用规划订阅弹层那种上下两行大表单。`md` 以下折到标题下一行并右对齐。更改立即 `PATCH /health/profile`。副标题「默认最近 7 天…」仍在标题下方全宽。
- **健康页顶部：** 待办条数 &gt; 0 时展示待办列表（训练一句 + 候选任务一句 + 三个按钮）。待办文案带课表任务标题，便于区分力量课 vs 跑步课 vs 康复课。
- **健康 → 基础信息 → 训练与日程：** 总开关、最短时长、步行最短时长、核销后是否改时间。不重复空间/项目选择。
- **训练详情：** 「已记入日程 · {任务标题}」或「未记入日程」；已关联可取消；未关联可「记入日程」（列出时间接近的候选；也可搜索自己负责的任意任务手动绑定，用于选错项目且标题不像训练的情况）。否则补记到当前目标项目。
- **任务抽屉（负责人）：** 一行「健康训练」链到 `/my/health/workouts/{id}`。
- **日程卡片：** `status=done` 且存在 `linked` 主记录时，标题旁一个小图标或「健康」字样（Web `CalendarTaskCard`）。不改完成删除线规则。

文案一律简体中文。

---

## 11. 场景表（冲突与特例）

| # | 场景 | 结果 |
|---|------|------|
| 1 | 随机跑步，当天无跑步课表 | 补记一条已完成「跑步 …」 |
| 2 | 课表力量 19:00，实际力量 19:12 | 核销课表，不新建；默认把块挪到 19:12 |
| 3 | 课表力量 19:00，中午 12:00 也有力量 | 待办，不自动、不补记第二条 |
| 4 | 课表力量 + 另一次随机跑 | 力量核销课表（留在力量课表的项目）；跑步补记到「近期训练」所选项目。日程两条 |
| 5 | 上午课表跑 + 晚上课表力量，实际两条 | 一对一核销，跑对跑、力对力；可来自两张不同订阅模板 |
| 5b | 同时订力量、跑步、康复三张课表 | 三张导入的任务都进候选池（同项目靠落点，不同项目靠标题）；健康记录仍一套 |
| 5c | 当晚力量课与康复课时间重叠，只练了力量 | 核销力量；康复课保持未完成 |
| 5d | 康复课实际被手表记成 `prep_recovery` 40 分钟 | 可核销康复课表（`prep_recovery` 属 mind 族，不是类型噪声） |
| 6 | 5 分钟走 + 40 分钟跑 + 5 分钟放松 | 一组；跑核销/补记；另外两条卫星 |
| 7 | Watch 与 Strava 各一条同一跑 | 一条主记录进日程，另一条 duplicate |
| 8 | 3 分钟走动、7 分钟冷却 | 不进日程 |
| 9 | 20 分钟步行 vs 课表「跑步」 | 不自动；若同一天可待办 |
| 10 | 先手填「跑步」再同步训练（补记目标项目内且时间重叠） | 核销手填任务，不建第二条 |
| 10b | 手建「跑步」却选了工作项目 | 标题识别为 run，**仍核销**，不因项目错误而放弃 |
| 10c | 手建「晨练」在工作项目（无训练关键词） | 自动不绑；训练详情可手动指定该任务 |
| 10d | 同时刻的「开会」在工作项目 | 不是候选，不绑、不进待办 |
| 11 | 先勾课表完成，训练后到 | 仍关联，保持完成，不新建 |
| 12 | 周日才导入本周课表，周一已跑完 | 导入后关联器再跑，核销周一任务 |
| 13 | 该周跳过规划导入 | 本周训练按补记 |
| 14 | 计划 60 分钟只练 20 分钟 | 仍核销并完成，展示实际时长 |
| 15 | 没戴表 | 课表保持未完成 |
| 16 | 在日程勾完成 | 不创建健康训练 |
| 17 | 训练在健康 App 被删 | 补记任务归档；课表任务保持完成并解除关联 |
| 18 | 训练改时间 | 补记任务跟随；课表核销且「改到实际时间」开启时跟随 |
| 19 | 用户改补记标题 | 同步不覆盖标题 |
| 20 | 用户删补记任务 | 该训练 suppressed，不重建 |
| 21 | 待办点「忽略」 | suppressed |
| 22 | 待办拆错后取消关联再绑别条 | 旧对 rejected，新对 user linked |
| 23 | 首次开通回灌 90 天 | 只核销已有课表；补记仅 enabled_at−48h 之后 |
| 24 | 出差时区 | 绝对时间比重叠；自然日用 §4 时区 |
| 25 | 模板改槽位 | 已导入任务不回写（规划域原规则）；匹配看任务当前时间 |
| 26 | 多条训练订阅（项目可不同） | 全部符合 §3.1 的任务进入候选池；补记只写入「近期训练」选定项目 |
| 26b | 从未选过空间/项目 | ensure 创建或复用「健康 / 训练记录」，选择器显示这对 |
| 26c | 已有自己的「健康」空间 | 不新建空间；缺「训练记录」项目则只建项目 |
| 26d | 改选择器到别的项目 | 之后补记去新项目；旧补记任务不搬家 |
| 26e | 「健康」空间被删 | profile 外键置空，下次 ensure 再创建 |
| 27 | 总开关关闭 | 新训练不核销不补记；已有 link 不动 |
| 28 | 课表标题只有「训练」，当天仅此一条且时间重叠 | 允许自动核销 |
| 28b | 两张课表当天都叫「训练」且都重叠 | 待办，不自动 |
| 29 | 工作空间成员打开别人的课表任务 | 抽屉不展示健康块 |
| 30 | 卫星热身不足 8 分钟 | 不单独成事，挂主任务 |

---

## 12. 测试

core-service 纯函数（无 DB）优先：

- 窄族 / 宽族 / 关键词 / wildcard
- 分数边界：重叠 50%、开始差 90 分钟、自动 vs 待办
- 一对一贪心：两课表两训练不交叉绑错；力量训练不核销跑步课
- 标题「跑步」在错误项目仍可核销；「开会」在其它项目不是候选
- 重复件折叠；30 分钟组；噪声不补记
- 步行不自动核销跑步课表；`prep_recovery` 可核销「康复」课
- 回灌窗口：窗口外不补记、仍可核销

API / 集成：

- `sync_workouts` 后课表任务变 `done` 且只有一条日程任务
- 无课表则在补记目标项目新建 `done` 任务；profile 为空时创建「健康 / 训练记录」且不重复创建
- 已有自己的「健康」空间则复用，只补「训练记录」项目
- 第二次同步同一 `hk_uuid` 不新建任务
- 删除补记任务后再同步不重建
- 待办 confirm / materialize / suppress
- 非主人访问 link → 404
- 手动 `link_item` 可绑到自己负责但不在候选池的任务

Web：近期训练标题右侧空间/项目选择；待办三按钮；训练详情展示已关联任务并可手动改绑。

---

## 13. 第一期不做

- iOS 待办、设置、日程「健康」徽标、补记空间/项目选择（任务本身会在 iOS 日程出现；目标以 Web 已存或 ensure 默认为准）
- 课表目标（配速、组数、公里）与完成度
- 根据实际训练自动改下周规划
- 健康数据进入工作空间活动流或成员可见详情
- 匹配任意非训练任务
- 静默导入下一周期课表
- 用户可配的活动族矩阵（第一期写死 §4.1）
- 历史「补记最近 7 天」按钮（需要时再做；窗口规则已允许 enabled_at−48h）

---

## 14. 文件落点（实现时）

| 路径 | 职责 |
|------|------|
| `codes/core-service/app/services/workout_schedule_match.py` | 纯函数：族、关键词、分数、分配、聚类、重复件 |
| `codes/core-service/app/services/workout_schedule.py` | 读候选、ensure 补记目标、写 link / 任务、触发入口 |
| `codes/core-service/tests/test_workout_schedule_match.py` | 纯函数单测 |
| `codes/core-service/tests/test_workout_schedule.py` | ensure「健康 / 训练记录」、多课表核销集成 |
| `codes/core-service/app/migrations/versions/` 下一条 revision | `health_workout_link` 表；`health_profiles` 新列。`down_revision` 为当时 alembic head |
| `codes/core-service/app/models/health.py` | ORM（**不改** `plan.py`） |
| `codes/core-service/app/services/health_api.py` | `sync_workouts` / 训练软删后调用 reconcile |
| `codes/core-service/app/services/plan_apply.py` | `materialize_run` 后调用 reconcile |
| 删除 `items` 的 service | 成功删除后按 §8 更新 link |
| `codes/web/src/components/health/MyHealthWorkouts.tsx` | 标题右侧空间/项目芯片 |
| `codes/web/src/components/health/` | 待办、设置分区、详情关联行（含手动改绑） |
| `codes/web/src/components/CalendarTaskCard*` | 已关联徽标 |
