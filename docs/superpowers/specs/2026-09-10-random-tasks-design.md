# Random Tasks Design（随机任务）

**Date:** 2026-09-10  
**Branch:** `cursor/random-tasks-design-ea10`  
**Scope:** Web 侧栏「随机任务」+ core-service `random_task_*` 个人域 + 与日程拖拽联动 + 月末报告与每日鼓励文案  
**Out of scope（第一期）:** iOS / Android；付费模板库；LLM 实时对话式生成；跨用户共享任务池；邮件/推送提醒；把随机任务写入 `activity_log`；自动静默写入日程（必须用户拖入或确认排期）

## Goal

为每位用户按月生成一套「随机任务」列表：结合个人喜好、能力、常用事项，以及日常日历空余时间，产出兴趣、挑战、家务、个人成长等多样化任务。用户可自定义每月数量（默认 50），把任务拖入日常日程，在本页跟踪进度；每日展示不同鼓励文案；月末自动生成评分报告。

## Approaches considered

| 方案 | 做法 | 优点 | 缺点 |
|------|------|------|------|
| A. 扩 Plan 域 | 用月周期模板 + 随机槽位生成 | 复用导入/订阅 | 模板是确定性相对日程，与「随机池 + 自选排期」语义冲突 |
| B. 直接造 Item | 月初往指定项目批量建无日期 Item | 拖拽复用 undated 面板 | 50 条污染项目与「未排期」列表；偏好/报告无处挂 |
| **C. 个人域 + 排期物化（推荐）** | `random_task_*` 挂 `owner_user_id`；池内卡片；拖入日程时再创建 `Item` | 对齐 health/sticky；日历干净；进度/报告一等公民 | 需新建域与拖拽桥接 |

**Decision:** 采用 **C**。随机任务是个人生活玩法，不属于 Workspace 协作；物化后的 `Item` 进入用户选定的空间/项目，从而出现在「我的日程」。

## Decisions (proposed)

| Topic | Choice |
|-------|--------|
| 数据归属 | 个人域，只挂 `owner_user_id`，对齐健康 / 便利贴 |
| 表名前缀 | `random_task_` |
| 与日程关系 | 池内任务无 `start_at`；拖入或「排到今日」时创建 `Item`，并回写 `item_id` |
| 月批次 | 每月一份 `random_task_month`；可补生成差额，不可无限刷爆上限 |
| 数量 | 用户可配 `target_count`，默认 **50**，范围 **10–100** |
| 空余时间 | 读用户「我的日程」已有 Item 忙闲，只作生成权重与建议时长，不自动占坑 |
| 任务类别 | `interest` / `challenge` / `chore` / `growth` 四类 |
| 鼓励文案 | 服务端按日确定性抽取（用户 id + 日期种子），保证同日刷新不变、隔日必变 |
| 月末报告 | cron 于次月 1 日用户时区 00:30 生成；也可手动「提前结算」 |
| 评分 | 完成率 + 类别多样性 + 挑战完成加成 + 连续打卡天数，百分制 |
| Web 入口 | 侧栏独立「随机任务」`/my/random-tasks`，不塞进规划或健康 |
| i18n | `zh` / `en` 同步 |
| 活动日志 | 个人域写入不调用 `log_activity`（对齐健康） |

---

## 1. 信息架构与页面

侧栏在「规划」与「数据分析」之间增加 **随机任务**（图标建议 `casino` 或 `shuffle`），路由 `/my/random-tasks`。

| 路由 | 用途 |
|------|------|
| `/my/random-tasks` | 本月任务池、进度、鼓励文案、快捷排期 |
| `/my/random-tasks/setup` | 偏好 / 能力 / 常用事 / 月目标数量 / 默认落点项目 |
| `/my/random-tasks/history` | 历史月份列表与报告入口 |
| `/my/random-tasks/reports/[yearMonth]` | 单月报告详情 |

也可把 setup / history 做成同页 Tab 或抽屉，第一期优先单页 + setup 子页，降低导航噪音。

### 1.1 主页 `/my/random-tasks` 布局

自上而下四段，**一屏一件事**：

1. **今日鼓励**  
   - 一行文案 + 轻量换日动效（淡入即可，不做飘字）。  
   - 旁注本月进度摘要：`已完成 / 已排期 / 总数`。

2. **本月进度**  
   - 环形或条形完成率；四类别完成分布；「挑战」单独强调。  
   - 状态筛选：全部 / 待领取 / 已排期 / 已完成 / 已跳过。

3. **任务池**  
   - 卡片列表（非看板）：标题、类别色标、建议时长、难度、状态。  
   - 支持拖到右侧「迷你周历」或点击「排到…」选日选时段。  
   - 已排期卡片展示关联日程时间，点开跳转任务抽屉（复用 `TaskDrawerWithComments`）。

4. **迷你周历（排期落点）**  
   - 展示本周忙闲条；拖入时高亮空档；落点确认后写 `Item`。  
   - 「在完整日程中打开」链到 `/my/schedule`。

空状态：未完成 setup → CTA「先设置喜好与能力」；已 setup 但本月未生成 → 「生成本月任务」。

### 1.2 Setup `/my/random-tasks/setup`

表单分区：

| 分区 | 内容 |
|------|------|
| 喜好 | 多选标签 + 自定义（如阅读、户外、手工、游戏、社交…）上限 20 |
| 能力 | 技能/体能水平：标签 + 1–5 档（影响挑战难度抽样） |
| 常用事 | 家务与例行（洗碗、收纳、运动、记账…）；可标「本月想多做 / 少做」 |
| 生成策略 | 四类目标占比（默认 30% interest / 20% challenge / 25% chore / 25% growth，可调，和为 100%） |
| 月数量 | `target_count` 默认 50，滑杆 10–100 |
| 建议时长偏好 | 短（≤30m）/ 中 / 长；影响空档匹配 |
| 落点 | 默认 workspace + project（排期时创建 Item 用）；负责人=自己 |
| 时区 | 默认 `Asia/Shanghai`，用于月末结算与鼓励换日 |

保存后若当月尚无批次，提示「立即生成」；若已有批次，仅影响**下月**或提供「按新偏好补生成未领取差额」（不覆盖已排期/已完成）。

### 1.3 月末报告

- 封面：月份、总分、等级文案（如「稳健推进」「高能月」）。  
- 指标：完成数、完成率、已跳过、类别雷达、最长连续完成日、挑战完成数。  
- 亮点：3 条自动摘要（完成最多的类别、意外坚持的挑战、家务贡献）。  
- 下月建议：基于本月缺口微调占比提示（只读建议，需用户在 setup 确认才改）。

---

## 2. 产品流程

### 2.1 首次使用

```
打开随机任务 → 无 profile → Setup
→ 保存 profile → 生成当月 month + N 条 tasks
→ 主页展示鼓励文案 + 任务池
```

### 2.2 每月生成

- **触发：** 用户点击「生成本月」；或 cron 在每月 1 日用户时区 01:00 对已开启「自动生成」的用户跑批。  
- **输入：** profile、当月日历忙闲（从今日到月末）、历史完成偏好（可选加权）。  
- **输出：** `random_task_month` + `target_count` 条 `random_task_entries`。  
- **幂等：** 同用户同 `year_month` 仅一条 month；重复调用返回已有或 `409 month_exists`（补生成走专用接口）。

### 2.3 拖入日常

1. 用户拖任务到迷你周历空档，或点「排到」选 `start_at`/`end_at`（默认用建议时长）。  
2. 服务端：在默认（或本次所选）project 创建 `Item`（`status=todo`，`assignee=自己`，`repeat=none`），写入 `source_random_task_entry_id`。  
3. entry 状态 → `scheduled`，绑定 `item_id`。  
4. Item 完成后（日程里勾完成）→ 同步 entry → `done`（看 Item.status / 或 webhook 式在 item update 时联动）。  
5. 用户可「跳过」：entry → `skipped`，不占完成率分子，分母可选「有效任务数 = 总数 − skipped」（报告里两种都展示）。

### 2.4 从日程反查

「我的日程」中来自随机任务的 Item，卡片可带小标记（类别色点）；点开抽屉可见「来自随机任务 · 2026-09」。反向不强制：随机任务页是进度主场。

### 2.5 月末结算

- cron：次月 1 日 00:30（用户时区）生成 `random_task_report`。  
- 若仍有 `scheduled` 未完成：按未完成计；`todo`（未排期）计「未启动」。  
- 用户可提前「生成本月报告」（锁定后不可再改该月 entry 状态，或允许改但不重算除非点「刷新报告」——第一期：**可刷新一次**）。

---

## 3. 生成算法（第一期规则引擎，可替换）

第一期**不用 LLM 实时生成标题池的主体**，采用「种子任务库 × 用户画像 × 空闲约束」规则引擎，保证可测、可控、便宜。预留 `generator_version` 字段，后续可换 LLM 增强标题润色。

### 3.1 种子库

静态/可运营表 `random_task_seeds`（或代码内 YAML + DB 覆盖）：

- `category`、`title_template`、`duration_minutes`、`difficulty`（1–5）  
- `required_tags` / `excluded_tags`（匹配喜好与能力）  
- `energy`（low/medium/high，匹配空档质量）  
- `locale`（zh/en）

示例：  
- interest：「逛一次从没去过的咖啡馆」（30m, d2）  
- challenge：「连续 7 天每天拉伸 5 分钟」（系列型：第一期拆成单次「今日拉伸 5 分钟」× 权重，不做跨日连携实体）  
- chore：「整理书桌桌面 15 分钟」  
- growth：「用 20 分钟写本周复盘」

### 3.2 空闲分析

对用户时区下「今日 → 月末」每一天：

1. 拉取 assignee/participant 含自己的 Item 忙时段（复用 schedule calendar view 查询）。  
2. 切出空闲段；过滤短于 15 分钟的空隙。  
3. 得到日级特征：`free_minutes`、`longest_slot`、`evening_free` 等。

生成时：

- 总建议时长之和 roughly ≤ 月空闲 × `occupancy_ratio`（默认 0.35，避免排满）。  
- 长任务优先匹配 `longest_slot` 多的日子（只写入 `suggested_day` / `suggested_duration`，**不写死日程**）。  
- 空闲极少时：提高短时 chore/growth 比例，并在 UI 提示「本月日程较满，已偏短任务」。

### 3.3 抽样

1. 按类别占比分配名额（四舍五入后用最大余额法补齐到 `target_count`）。  
2. 在各类内按 tag 匹配打分，加权随机（用户 id + year_month + index 作种子，**可复现**）。  
3. 去重：同月标题指纹（归一化）不重复；与上月 done 标题降低权重而非禁止。  
4. 写出 entry：`title`、`category`、`difficulty`、`suggested_duration_minutes`、`suggested_day`（可空）、`reason`（短解释，如「匹配你的阅读喜好 · 周三下午有空档」）。

### 3.4 补生成

`POST .../months/{yearMonth}/top-up`：`additional_count` 或「补齐到 target」。只追加 `todo` 条目；已 scheduled/done/skipped 不动。

---

## 4. 每日鼓励文案

- 文案库 `random_task_encouragements`：`locale`、`tone`、`body`、`weight`。  
- 选取：`hash(user_id + local_date) % pool` 加权抽一条；同日稳定。  
- 主页顶部只读展示；不提供「换一条」（避免刷文案；若产品需要可第二期加「再激励」并记当日已换次数 ≤1）。  
- 月末报告另用总结语气，不复用日常库。

---

## 5. 评分模型

百分制，四维加权后取整：

| 维度 | 权重 | 计算 |
|------|------|------|
| 完成率 | 50% | `done / (total − skipped)`，分母为 0 则 0 |
| 排期行动力 | 15% | `(scheduled+done) / (total − skipped)` 在月中第 7/14/21 日快照均值，或简化为月末该比例 |
| 类别多样性 | 15% | 四类中「至少完成 1 个」的类数 / 4 |
| 挑战加成 | 20% | `challenge_done / challenge_total`（无挑战则该维满分不拖后腿：记 1.0） |

等级（展示用）：

- 90–100 高能月  
- 75–89 稳步向上  
- 60–74 有始有终  
- 40–59 轻装试水  
- 0–39 下月再燃  

报告存 `score`、`score_breakdown`（json）、`highlights`（string[]）、`suggestions`（string[]）。

---

## 6. 数据模型

均含 `id`、`created_at`、`updated_at`。个人域表不挂 `workspace_id`。

### 6.1 `random_task_profiles`

- `owner_user_id` (unique)  
- `timezone`  
- `target_count` int default 50  
- `category_weights` jsonb（四类占比）  
- `interest_tags` / `ability_tags` / `chore_tags` jsonb（`[{tag, level?}]`）  
- `duration_bias`：`short|mixed|long`  
- `default_workspace_id` / `default_project_id`  
- `auto_generate` bool default true  
- `occupancy_ratio` float default 0.35  
- `generator_version` str  

### 6.2 `random_task_months`

- `owner_user_id`  
- `year_month` char(7) `YYYY-MM`  
- `target_count`、`generated_count`  
- `status`：`active` \| `settled`  
- `profile_snapshot` jsonb（生成时画像快照）  
- unique(`owner_user_id`, `year_month`)

### 6.3 `random_task_entries`

- `month_id`、`owner_user_id`  
- `category`：`interest|challenge|chore|growth`  
- `title`、`body`（可空）、`difficulty`、`suggested_duration_minutes`  
- `suggested_day` date null  
- `reason` str null  
- `status`：`todo|scheduled|done|skipped`  
- `item_id` uuid null FK → `items` ON DELETE SET NULL  
- `seed_id` null  
- `sort_index`  
- `completed_at` null  
- `skipped_at` null  

### 6.4 `random_task_reports`

- `month_id` unique  
- `owner_user_id`、`year_month`  
- `score` int  
- `score_breakdown` jsonb  
- `highlights` / `suggestions` jsonb  
- `settled_at`  
- `refresh_count` int default 0  

### 6.5 `random_task_seeds` / `random_task_encouragements`

运营/种子数据；可用 migration seed + 管理端后续再做。

### 6.6 Item 扩展

`items` 增加可空：

- `source_random_task_entry_id` UUID FK → `random_task_entries` ON DELETE SET NULL  

与现有 `source_plan_*` 并列；互斥校验：有 plan 源则不应再有 random 源（应用层）。

完成联动：`Item` status → `done` 时，若存在 `source_random_task_entry_id`，将 entry 标 `done`；Item 从 done 改回则 entry 回 `scheduled`（若仍有时间）。

---

## 7. API（core-service）

前缀建议 `/random-tasks`（个人域，鉴权 `get_current_user`）。视图聚合放 `/views/me/random-tasks/...`。

| Method | Path | 说明 |
|--------|------|------|
| GET/PUT | `/random-tasks/profile` | 画像读写 |
| GET | `/random-tasks/months` | 历史月列表 |
| POST | `/random-tasks/months` | 生成指定/当前月 `{year_month?}` |
| GET | `/random-tasks/months/{yearMonth}` | 月详情 + entries |
| POST | `/random-tasks/months/{yearMonth}/top-up` | 补生成 |
| PATCH | `/random-tasks/entries/{id}` | 跳过、改标题（可选） |
| POST | `/random-tasks/entries/{id}/schedule` | 排期：body 含 start/end、可选 project；创建 Item |
| DELETE | `/random-tasks/entries/{id}/schedule` | 取消排期：可选 archive Item，entry 回 todo |
| GET | `/random-tasks/months/{yearMonth}/report` | 报告 |
| POST | `/random-tasks/months/{yearMonth}/report` | 结算/刷新 |
| GET | `/views/me/random-tasks/home` | 主页聚合：鼓励文案、进度、entries、本周忙闲摘要 |

Busy 查询复用现有 `/views/schedule/calendar?scope=me`，不必新造日历引擎。

错误码示例：`profile_incomplete`、`month_exists`、`entry_not_schedulable`、`default_project_required`、`report_not_ready`。

写操作：`db.add/flush` → `commit`；不打 `log_activity`。

定时：

- `jobs/random_task_monthly_generate.py`：月初自动生成  
- `jobs/random_task_monthly_settle.py`：月初结算上月  

对齐 `plan_reminders` 的 cron + CLI 模式。

---

## 8. 前端（Web）

- 路由：`app/(app)/my/random-tasks/**`  
- SideNav 登记；`api-catalog.ts`、`make codegen` 同步类型  
- 拖拽：对齐 undated → calendar 的现有 DnD（`canClearScheduleByDrop` 模式）；迷你周历可先做「点选排期」MVP，DnD 作为同迭代增强  
- 任务完成态：依赖 Item 更新后 invalidate random-tasks queries  
- i18n：`messages/zh.json` + `en.json` 键前缀 `randomTasks.*`  
- UI：沿用现有 Material indigo token、Epilogue / Be Vietnam Pro；类别用语义色而非新主题皮肤  

### 交互细节

- 拖入冲突：目标时段已有事件 → toast 仍允许重叠（与现有日程一致）或提示「该时段已有安排」但不阻断。  
- 无默认项目：排期弹层强制选择空间/项目（复用 `PinnedTagSelect`）。  
- 跳过需确认；已完成不可跳过。  

---

## 9. 权限与隐私

- 仅 owner 可读写自己的 profile / months / entries / reports。  
- 物化 Item 遵循目标 workspace/project 的既有权限；无权限则 `403`。  
- 报告与鼓励文案不含他人数据。  

---

## 10. 分期

| 期 | 交付 |
|----|------|
| **MVP** | profile setup、规则引擎生成、主页进度+鼓励、点选排期→Item、完成联动、月末报告与评分、侧栏入口 |
| **MVP+** | 迷你周历 DnD、补生成、自动月初 cron、历史月浏览、日程卡片来源标记 |
| **二期** | LLM 润色/个性化标题、系列挑战（跨日 streak 实体）、运营后台种子/文案、iOS 只读进度 |

---

## 11. 测试要点

- 生成幂等与可复现种子  
- 类别名额和为 `target_count`  
- 空闲极少时时长分布偏向短任务  
- schedule 创建 Item 字段与 entry 绑定  
- Item done ↔ entry done 双向一致  
- 跳过不计入完成率分母  
- 同日鼓励文案稳定、换日变化  
- 报告分项加权与等级边界  
- 无 profile / 无默认项目的错误路径  

---

## 12. 开放问题（实现前需产品确认）

1. **跳过是否减分母**：本设计默认减分母（鼓励诚实跳过）；若希望「跳过=未完成」可改为不减。  
2. **挑战是否要真正的多日 streak**：MVP 拆成单次；若要「7 日挑战」需额外实体。  
3. **拖拽优先落点**：仅随机任务页迷你历，还是也要出现在「我的日程」未排期面板（需把 entry 同步成 undated Item——与方案 B 部分回流，不推荐 MVP）。  
4. **自动生成默认开还是关**：隐私敏感用户可能更想手动；可默认开并在 setup 明示。  

---

## Self-review

- 无 TBD 占位实现细节；开放问题集中在 §12。  
- 与 Plan 域边界清晰：不复用 plan_slots 随机化。  
- 与 Item/日程衔接点唯一：`schedule` API + `source_random_task_entry_id`。  
- 范围可控：第一期 Web + 规则引擎，LLM/iOS 明确延后。  
