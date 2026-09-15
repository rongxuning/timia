---
name: timia-schedule
description: Use when changing Timia calendar day/week/month/year views, overdue/undated/priority, task drag/reschedule, timezones, all-day items, natural-language parse, or /views/schedule APIs.
---

# Timia Schedule

日程**不是**独立实体：日历格子是 Item 的 `start_at`/`end_at` 投影。写走 items REST；读走 `/views/schedule/*`。

## 日历约定

- 时区默认 **`Asia/Shanghai`**（query `timezone`）
- **一周从周日开始**到周六（不要用 ISO 周一起）
- `view`: `day` \| `week` \| `month` \| `year`
- `scope`: `me`（我参与的）或 `project`（必须带 `workspace_id`+`project_id`）
- `me` 的 `involvement`: `assignee` \| `participant` \| `any`

## Item 时间规则

- 两边时间都可空；都有则 `end_at >= start_at`，否则 `invalid_time_range`
- **无日期任务只能 `status=todo`**（`undated_requires_todo`）
- 改期/完成必须带当前 `version`，冲突 `409 version_conflict`
- `repeat`: `none`/`daily`/`weekly`/`monthly`；规划导入生成的任务一律 `repeat=none`

## 前端

- Web：`src/components/schedule/*` + `useScheduleViews`；拖拽 PATCH 带 `version`
- iOS：`Features/Schedule/*`（几何/折叠有单测，改交互先跑 `TimiaTests`）
- NL：`POST /views/schedule/natural-language/parse` **不落库**；要 `text` + `reference_time` + `selected_date` + `timezone`

优先级四象限用 `"1"`–`"4"`，不是 low/high。MCP 读日历用 `get_schedule`，见 `using-timia-mcp`。
