---
name: using-timia-mcp
description: Use when calling Timia MCP tools, connecting to timia-mcp or https://timia.online/mcp, managing the user's schedule, tasks, workspaces, comments, overdue items, or natural-language task drafts via PAT.
---

# Using Timia MCP

Cursor 里 MCP 服务器名是 **`timia-mcp`**（不是 `timia-prod` / `timia`）。先 `GetDynamicTools` 再调 tool。

## Session start

1. `whoami` — 确认 PAT 用户
2. `list_workspaces` → `list_projects` — 后面写操作都要 `workspace_id` + `project_id`
3. 日程默认 `get_schedule(view="week")`；今日用 `view="day"`。时区默认 `Asia/Shanghai`。**周从周日开始**。

## Writes

| 动作 | Tool | 必带 |
|------|------|------|
| 新建 | `create_item` | `workspace_id`, `project_id`, `title` |
| 改字段 | `update_item` | 当前 `version` |
| 完成 | `complete_item` | 当前 `version` |
| 评论 | `add_comment` | `body` |
| 口语草稿 | `parse_natural_language` | **不落库**；确认后再 `create_item` |

`409` / `version_conflict` → `get_item` 拿新 `version` 再写。不要猜 version。

自然语言：`parse_natural_language(text, reference_time, selected_date)` → 给用户看草稿 → `create_item`。parse 本身不创建任务。

无日期任务不要改成 doing/done（API `undated_requires_todo`）。批量改期前先 `list_overdue` / `get_schedule` 列出来确认。

常用读：今日简报 = `get_schedule(view="day")` + `list_overdue`；四象限 = `list_priority`。

## 字段

- `status`: `todo` / `doing` / `done` / `archived`
- `priority`: `"1"` \| `"2"` \| `"3"` \| `"4"`（不是 low/medium/high）
- 时间：ISO-8601；无时区按 `Asia/Shanghai`

## 错误

| error | 处理 |
|-------|------|
| `unauthorized` | PAT 无效/撤销，不要重试写 |
| `insufficient_scope` / `not_a_member` | 换空间或停手 |
| `readonly_mode` | 当前 MCP 只读 |
| `not_found` | 核对三个 id |

## 不要做

- 不要调用删除 workspace/project、清健康数据、HealthKit sync（P0 未注册）
- 不要把便签/规划/健康当已有 MCP tools（尚未交付）
