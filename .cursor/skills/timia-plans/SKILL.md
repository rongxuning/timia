---
name: timia-plans
description: Use when changing Timia plan templates, slots, subscribe/apply/import, plan notifications, relative calendars, usage_kind/period_kind, or /views/plans APIs.
---

# Timia Plans

规划是**相对时间表**，确认导入前不写 `items`。槽位在 `plan_slots`，没有 `item_id`。**iOS 不做规划**（仅 Web + core）。

## 创建后不可改

| 字段 | 值 |
|------|-----|
| `usage_kind` | `plan_mode`（加入一次）\| `subscription_mode`（订阅） |
| `period_kind` | `day` \| `week` \| `month` \| `year` |
| `visibility` | `private` \| `public`（无付费） |

## 导入

- 加入：`POST /plan-templates/{id}/apply`，每次**一个**周期窗口。周锚点用操作者账号的 `week_starts_on`（`1`/`6`/`7`）
- 订阅：`POST /plan-templates/{id}/subscribe` → 立刻导入**本周期**；以后周期靠站内通知确认
- 必须选 `workspace_id` + `project_id`；负责人=操作者；生成任务 `repeat=none`
- 非法日（如 2 月 31 日）跳过该槽，返回 `skipped_slots`，其余仍导入
- 空模板加入：`400 empty_template`
- 取消订阅再订 = 同一 `plan_subscriptions` 行的新分段

## 相对槽

周 `rel_day`：`1`=周一 … `7`=周日。日模板占位仍是 `0`；月/年是当月几号 `1`–`31`。不跨自然日。上限：日 20 / 周 50 / 月 80 / 年 100。

只有「周 + 订阅」模板保存 `plan_templates.week_starts_on`（创建必填，之后可改）。订阅的本周期、`period_start` 和提醒按**模板**起始日加订阅者时区，不用订阅者账号设置。编辑器列固定周一到周日，不随账号旋转。改模板起始日不改写已导入事项；与已应用日期范围重叠的新窗口视为已导入。

列表走 `/views/plans`（发现/已导入/订阅中）和 `/views/plan-notifications`。写评论走 `/plans/{id}/comments`。

MCP P1 才有 plans tools；现在不要假装 MCP 能订阅/导入。规格：`docs/superpowers/specs/2026-08-17-plan-domain-design.md`。
