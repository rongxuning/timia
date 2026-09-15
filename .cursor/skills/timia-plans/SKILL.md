---
name: timia-plans
description: Use when changing Timia plan templates, slots, subscribe/apply/import, plan notifications, relative calendars, usage_kind/period_kind, or /views/plans APIs.
---

# Timia Plans

规划是**相对时间表**，确认导入前不写 `items`。槽位在 `plan_slots`，没有 `item_id`。**iOS 不做规划**（仅 Web + core）。

## 创建后不可改

| 字段 | 值 |
|------|-----|
| `usage_kind` | `one_shot`（加入一次）\| `subscription`（订阅） |
| `period_kind` | `day` \| `week` \| `month` \| `year` |
| `visibility` | `private` \| `public`（无付费） |

## 导入

- 加入：`POST /plans/{id}/apply`，每次**一个**周期窗口；周锚点必须是**周日**
- 订阅：`POST /plans/{id}/subscribe` → 立刻导入**本周期**；以后周期靠站内通知确认
- 必须选 `workspace_id` + `project_id`；负责人=操作者；生成任务 `repeat=none`
- 非法日（如 2 月 31 日）跳过该槽，返回 `skipped_slots`，其余仍导入
- 空模板加入：`400 empty_template`
- 取消订阅再订 = 同一 `plan_subscriptions` 行的新分段

## 相对槽

周 `rel_day`：0=周日 … 6=周六。不跨自然日。上限：日 20 / 周 50 / 月 80 / 年 100。

列表走 `/views/plans`（发现/已导入/订阅中）和 `/views/plan-notifications`。写评论走 `/plans/{id}/comments`。

MCP P1 才有 plans tools；现在不要假装 MCP 能订阅/导入。规格：`docs/superpowers/specs/2026-08-17-plan-domain-design.md`。
