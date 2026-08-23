# Plan Domain Design（规划模板）

**Date:** 2026-08-17  
**Branch:** `feature/plan-domain`  
**Scope:** Web 规划菜单 + core-service `plan_*` 域（模板、加入、订阅、站内通知、定时提醒）  
**Out of scope:** 付费/订阅制收费；iOS；邮件/推送；静默自动写入日程；时段跨自然日；模板改动回写已生成任务

## Goal

在 Web 侧栏增加「规划」：用户可发现、创建、查看规划模板。模板是独立的相对时间表，确认导入前不创建任务。加入型一次导入一个周期窗口；订阅型从本周期开始导入，之后每个周期开始前站内询问是否导入，可取消后再订（分段记录）。

## Decisions (confirmed)

| Topic | Choice |
|-------|--------|
| 架构 | 独立规划域；表一律 `plan_` 前缀 |
| 模板与任务 | 加入/确认并入之前不写 `items`，模板表不挂 `item_id` |
| 模板类型 `usage_kind` | `one_shot`（加入）与 `subscription`（订阅）是两种模板，创建后不可改 |
| 周期 `period_kind` | `day` / `week` / `month` / `year`，创建后不可改 |
| 加入 | 每次只导入 **一个** 周期窗口（周模板必须选要导入的那一周） |
| 订阅起点 | **本周期**（订阅成功即导入当前日/周/月/年） |
| 后续周期 | 周期开始前一日本地 20:00 起站内通知，用户确认才导入；可跳过 |
| 取消订阅 | 支持；再订阅 = 新分段，历史分段保留 |
| 用户库 | 「已导入」看历史次数和关联任务；「订阅中」看分段时间轴和关联任务 |
| 范围 `visibility` | 仅 `private` / `public`；第一期 schema 与 UI **都不出现付费** |
| 创建人介绍 | 字段在模板上，作者按模板维护（不是账号统一 bio） |
| 生成任务去向 | 必须选空间+项目；负责人=操作者，从而出现在「我的日程」 |
| 生成任务 `repeat` | 一律 `none`（周期由订阅承担，不用任务 repeat） |
| 通知通道 | 第一期仅站内 + 规划菜单角标；定时任务用主机 cron 调 CLI |
| 沟通 | 模板详情讨论（`plan_comments`），不做私信 |

---

## 1. 信息架构与页面

侧栏在「我的日程」和「工作空间」之间增加 **规划**（图标 `calendar_month`）。

| 路由 | 用途 |
|------|------|
| `/plans` | 发现 / 我创建的 / 已导入 / 订阅中 |
| `/plans/new` | 创建模板（先选类型+周期） |
| `/plans/[id]` | 详情：介绍、相对日历、讨论、加入或订阅 |
| `/plans/[id]/edit` | 创建人编辑 |

### `/plans` 四个 Tab

1. **发现**：仅 `visibility=public`。筛选可组合：名称模糊、创建人 `display_name` 模糊、标签（多选 AND）、周期、类型（加入/订阅）。此 Tab 不提供「私有」范围筛选项。
2. **我创建的**：当前用户创建的全部模板。可按私有/公开、周期、类型筛。
3. **已导入**：当前用户至少有一次 `applied` 导入的模板。展示该用户的导入次数、每次导入的锚点、关联任务（已删标「已删除」）。加入型与订阅型只要成功导入过都在此。
4. **订阅中**：当前存在 **进行中分段**（`ended_at IS NULL`）的订阅关系。展示全部分段时间轴、每段导入次数与任务、待确认批次、取消订阅。已取消且无进行中分段的关系不出现在此 Tab；若曾导入过则仍在「已导入」。

卡片字段：标题、类型、周期、范围、创建人、标签、全站 `use_count`。无付费标记。

### 详情

- 标题、介绍、创建人介绍、标签、全站使用次数、相对日历预览、讨论。
- 加入型：仅「加入」。弹层：空间、项目（复用任务抽屉 `PinnedTagSelect`）、**一个**周期锚点选择器（日=日期；周=选一周，周首周日；月=年月；年=年份）、预览将创建的任务数。
- 订阅型：未订则「订阅」；有进行中分段则「取消订阅」。订阅弹层：空间、项目、时区（默认 `Asia/Shanghai`）。提交即订阅 **并导入本周期**（预览文案写明本周期日期范围与任务数）。不提供加入型那种任意选一周的入口。
- 创建人额外显示编辑入口。

### 创建 / 编辑

1. 选 `usage_kind` 与 `period_kind`（创建后均不可改；编辑页只读展示）。
2. 标题、介绍、创建人介绍、范围、标签（自定义，没有则新建；每模板最多 8 个，每标签最长 20 字，trim）。
3. 规范日历编辑时段（点空白创建，交互对齐现有日历，存相对坐标）。
4. 保存。允许 0 个时段，但加入/并入 0 槽返回 `400 empty_template`。

规范日历：日=一天；周=日–六；月=抽象 31 天；年=12 个月。

---

## 2. 相对时段与映射

`plan_slots` 只属于模板，**没有 `item_id`**。第一期结束时刻必须落在同一相对日（不跨自然日）。全天：`all_day=true`，忽略分钟或存 0–1440。

| 字段 | 日 | 周 | 月 | 年 |
|------|----|----|----|----|
| `rel_month` | null | null | null | 1–12 |
| `rel_day` | 0 | 0–6（周日=0，与现有日历一致） | 1–31 | 1–31 |
| `start_minute` / `end_minute` | 当天 0–1440 | 同左 | 同左 | 同左 |

另：`title`、`body`、`details`、`color`、`priority`、`location`、`sort_index`，语义对齐 `Item`。

**加入锚点 `period_start`（日期，订阅者/操作者时区的日历日）：**

- 日：选中的那天
- 周：该周周日
- 月：该月 1 日
- 年：该年 1 月 1 日

映射：相对日 + 分钟 → 该窗口内的绝对 `start_at` / `end_at`。非法日（月模板 31 号对上 2 月）跳过该槽，批次返回 `skipped_slots`，其余槽仍导入，不整单失败。

上限（防滥用）：日 20 / 周 50 / 月 80 / 年 100 个槽。

---

## 3. 表

### `plan_templates`

- `created_by_user_id`、`title`、`description`、`creator_intro`
- `usage_kind`：`one_shot` \| `subscription`
- `period_kind`：`day` \| `week` \| `month` \| `year`
- `visibility`：`private` \| `public`
- `use_count`：全站成功 `applied` 次数
- `version`：改标题/介绍/槽位后 +1
- 无 `workspace_id` / `project_id` / `paid`

### `plan_slots`

见 §2。FK 仅 `template_id`。

### `plan_tags` / `plan_template_tags`

词表 + 多对多。标签名唯一（trim 后）。

### `plan_subscriptions`

「某用户把某订阅型模板订到某项目」的稳定关系。取消后再订 **仍是这一行**。

- `template_id`、`subscriber_user_id`、`workspace_id`、`project_id`、`timezone`
- unique `(template_id, subscriber_user_id, project_id)`
- 同一模板可订到不同项目

### `plan_subscription_segments`

- `subscription_id`、`started_at`、`ended_at`（null=进行中）
- 同一 subscription 最多一段 `ended_at IS NULL`
- 订阅：插入新段；取消：写 `ended_at=now`，作废该关系上未确认 `pending`

### `plan_apply_runs`

每一次写 `items` 的唯一入口。列：`template_id`、`template_version`、`actor_user_id`、`workspace_id`、`project_id`、`source`（`one_shot` \| `subscription`）、`subscription_id`、`segment_id`、`period_start`、`period_kind`、`status`、`skipped_slots`（JSONB，非法日等）、`applied_at`。

`status`：`pending` \| `applied` \| `skipped` \| `expired` \| `canceled`。

| | 加入型 | 订阅型本周期（订阅当时） | 订阅型后续周期 |
|--|--------|-------------------------|----------------|
| `source` | `one_shot` | `subscription` | `subscription` |
| `subscription_id` / `segment_id` | null | 有 | 有 |
| `period_start` | 用户选的窗口 | 订阅时刻的本周期起点 | 被提醒的周期起点 |
| `status` | 直接 `applied` | 同一请求内 `applied` | 先 `pending`；确认 `applied`；用户跳过 `skipped`；周期结束未处理 `expired`；取消订阅作废 `canceled` |

唯一约束（只约束「成功导入」与「进行中的待确认」，避免跳过/过期挡住以后重试以外的重复灌任务）：

- 加入：同一 `actor_user_id + template_id + project_id + period_start` 不得有第二条 `source=one_shot` 且 `status=applied`（再导入同一窗口 → `409 already_applied`）。
- 订阅：同一 `subscription_id + period_start` 不得有第二条 `status=applied`；亦不得同时存在两条 `pending`。同一周取消再订时，若本周已 `applied` 则不再导入本周，下周期再提醒。

### `items` 可空追溯（仅生成后填写）

`source_plan_template_id`、`source_plan_slot_id`、`source_plan_apply_run_id`。删除模板时任务保留，这些 FK 置空。

### `plan_comments`

`template_id`、`author_user_id`、`body`、`parent_comment_id`、`deleted_at`。不复用 `comments`（现表强制 `workspace_id`+`item_id`）。

### `plan_notifications`

- `user_id`、`kind`：`upcoming_period` \| `template_updated` \| `comment_reply`
- `template_id`、`subscription_id`、`apply_run_id` 可空
- `read_at` 可空
- `meta` JSONB

---

## 4. 加入

仅 `usage_kind=one_shot`。否则 `400 wrong_usage_kind`。

1. 校验可见性（公开或自己的私有）与项目内容权限。
2. 用户选择 **一个** 周期窗口（周模板 = 选那一周）。
3. 写 `plan_apply_runs(applied)`，按槽创建 `Item`（`status=todo`，`assignee=操作者`，`created_by=操作者`，`repeat=none`）。
4. `use_count += 1`。
5. 在目标 workspace 记一条活动：`action=apply_plan`，`meta` 含 `template_id`、`item_count`、`period_start`。不为每个任务再刷一条（避免周模板 20 条刷屏）。

已生成任务按普通任务改删完成，不回写模板。

---

## 5. 订阅

仅 `usage_kind=subscription`。

### 5.1 订阅（从本周期开始）

1. 校验模板类型、可见性、项目权限。
2. 若无 `plan_subscriptions` 行则创建；若已有则复用。
3. 若已有进行中分段 → `409 already_subscribed`。
4. 插入新 `plan_subscription_segments(ended_at=null)`。
5. 计算 **本周期** `period_start`（订阅者 `timezone`）。
6. 若该 `subscription_id + period_start` 尚无 `applied`：立即导入（与加入相同的生成逻辑，`source=subscription`，挂当前 segment）。
7. 若本周期已经导入过（例如同周取消再订）：不重复导入，分段仍开始，下一次提醒走下一周期。

订阅弹层必须展示本周期日期范围与将创建任务数。提交 = 同意导入本周期。

### 5.2 后续周期：定时提醒

主机 cron **每小时** 调用：

```text
docker compose exec -T core-service uv run python -m app.jobs.plan_reminders
```

（具体 compose 服务名以仓库为准；逻辑放 `app/jobs/plan_reminders.py` 纯函数，便于单测。）

对每个进行中分段，令 `D` = 该订阅下 **尚未有任何 run** 的最近未来（或尚未开始的）周期起点：

- **提醒窗口**（订阅者 `timezone`）：本地日历日 = `D` 的前一天，且本地小时 ≥ 20。例如周模板、下周周日为 `D` → 周六 20:00 起出现待确认；日模板、明天为 `D` → 今天 20:00 起提醒明天。
- 窗口内且该 `subscription_id + D` 尚无 run → 插入 `pending` + `upcoming_period` 通知。
- 周期已结束（本地日期 > 该周期最后一天）且仍为 `pending` → `expired`，不创建任务。

订阅当天已导入本周期，因此 cron 只为 **之后的周期** 建 pending，不会在订阅请求里再灌下一周期。靠唯一约束防重复提醒。不引入 Celery。

规划菜单角标 = 当前用户未读通知数 + pending 批次数（去重展示即可）。「订阅中」顶部待确认卡片：确认 / 跳过。

确认：按 **确认当时** 的模板版本读槽并生成任务（`applied`，`use_count += 1`）。若模板 `version` 比通知时新，文案提示「模板已更新」。  
跳过：`skipped`，该周期不再导入。  
取消订阅：结束当前分段；该关系上所有 `pending` 改为 `canceled`；cron 不再扫描已结束分段。已导入任务不动。

### 5.3 模板被作者修改

已 `applied` 的任务不改。未确认 `pending` 在确认时用新槽。给进行中订阅者一条 `template_updated`（改槽或改标题/介绍时）。

### 5.4 删除模板

仅创建人。有效分段结束；pending 作废；已生成任务保留并清空 `source_*`。

---

## 6. 权限

| 动作 | 谁 |
|------|----|
| 发现公开模板 | 登录用户 |
| 看私有 / 编辑 / 删 | 创建人 |
| 加入 / 订阅 | 能看到该模板，且对目标项目有内容权限（与创建任务相同） |
| 讨论 | 能看到该模板的登录用户 |
| 取消订阅 | 订阅者本人 |

---

## 7. API

只读走 `routes/views/` + `services/views/`；写入走 `routes/` + `services/`。鉴权 `get_current_user`。写操作 `log_activity`（有 workspace 时）。错误码 snake_case。

### Views

- `GET /views/plans`  
  Query：`tab=discover|created|imported|subscribed`，`q`，`visibility`，`creator_q`，`tag`（可重复），`period_kind`，`usage_kind`，分页。
- `GET /views/plans/{id}`  
  详情 + slots + 作者 + 当前用户是否在订、待确认 run、该用户导入次数。
- `GET /views/plans/imported`  
  当前用户已导入模板：次数、runs、关联 item 摘要。
- `GET /views/plans/subscribed`  
  进行中订阅：分段、各段 runs、关联 item 摘要、pending。
- `GET /views/plan-notifications` 未读/最近通知（含 pending 批次摘要）。

标记已读：`POST /plan-notifications/{id}/read`。

### 写入

- `POST /plan-templates`、`PATCH /plan-templates/{id}`、`DELETE /plan-templates/{id}`
- `PUT /plan-templates/{id}/slots` 整表替换相对时段
- `POST /plan-templates/{id}/apply` `{ workspace_id, project_id, period_start }` 仅加入型
- `POST /plan-templates/{id}/subscribe` `{ workspace_id, project_id, timezone }` 仅订阅型；成功则已导入本周期（或跳过重复）
- `POST /plan-subscriptions/{id}/cancel` 结束当前分段
- `POST /plan-apply-runs/{id}/confirm`、`/skip`
- 模板评论：`GET/POST /plan-templates/{id}/comments`，`PATCH/DELETE .../comments/{id}`

生成任务只在 service 内批量 `db.add`，禁止前端对每个槽调用 `POST /items`。

OpenAPI 变更后 `make codegen`。

---

## 8. Web 实现要点

- `SideNav` 增加规划入口；`AppShell` 不必为规划页挂任务创建抽屉例外（仍用全局新建任务按钮）。
- 页面放 `codes/web/app/(app)/plans/`；组件放 `codes/web/src/components/plans/`；API 客户端 `codes/web/src/lib/api/plans.ts`；类型经 codegen + 如有 views 手写补充则放 `codes/web/src/types/api/views/plans.ts`。
- 相对日历编辑器复用现有日历交互模式，但数据源是 slots 而非 schedule views；不要把假日期写进 `items`。
- 待确认与角标：拉 `GET /views/plan-notifications` 与 subscribed pending。

---

## 9. 测试

core-service（无 DB 的纯函数优先）：

- 相对槽 → 绝对时间（日/周/月/年，含 2 月 31 日跳过）
- 本周期 `period_start` 计算（时区、周日周首）
- 提醒窗口：周期开始前一日本地 20:00；过期 pending → expired
- 同一 `subscription_id + period_start` 不重复 applied
- 加入型选错类型 / 订阅型调 apply → 错误码
- 取消后再订：新分段；本周已导入则不重复灌任务

Web：规划导航可见；加入弹层必须选择一周（周模板）；订阅中展示分段。

---

## 10. 第一期不做

支付与 `paid` 字段；iOS；邮件/APNs；静默自动导入；槽位跨天；用任务 `repeat` 表达规划周期；全局通知中心；模板版本管理 UI（仅存 `version` 整数）；草稿态（保存即当前版本）。
