---
name: extending-timia-mcp
description: Use when adding, changing, or registering Timia MCP tools in codes/mcp-server, tool profiles p0/p1/full, PAT scopes, Streamable HTTP, or mapping new core-service endpoints to MCP.
---

# Extending Timia MCP

MCP 是 **core-service 的薄适配器**：校验参数 → `Authorization: Bearer tm_pat_…` → REST → 裁剪 JSON。不直连 Postgres，不复制 RBAC，不在 MCP 进程里跑 LLM。

服务器名常量：`MCP_SERVER_NAME = "timia-mcp"`（Cursor key 同名）。

## 加 tool

1. `tools/<area>.py` 写 `*_impl(client, ...)`
2. `profiles.py` 加入 `P0_TOOLS` 或 `P1_TOOLS`（notes/plans = P1，health 只读 = full/P2）
3. `tools/__init__.py` 的 `register_all`：英文 `description`，`is_tool_enabled` 后注册
4. `tests/` 用 respx 断言 method/URL/body 与 401/403/409
5. 写操作走 `assert_writable`；成功返回带 `version`

P1 计划中的 notes/plans **会创建真实数据**，description 必须写明，并要求 `workspace_id` + `project_id`。领域约束见 `timia-sticky-notes` / `timia-plans`；健康只读见 `timia-health`。

## 禁止注册

- 删 workspace / project
- `/health/sync/*`、`DELETE /health/data`、`/dev/*`
- 改成员角色（除非未来单独 destructive profile + `confirm=true`）

## 传输

- stdio：进程级 `TIMIA_PAT` 必填；日志只写 **stderr**
- HTTP：每请求 Bearer PAT；禁止进程级共享 PAT 服务多用户
- Tool 名 `snake_case`；错误码 snake_case，与 API 对齐（`version_conflict`、`unauthorized`）

## 鉴权对照

core-service 是 scope 权威；mcp-server 前置检查。新 REST 路径必须加入 PAT path→scope 表，否则 `pat_path_not_allowed`。

测：`make mcp-server-test`。规格：`docs/superpowers/specs/2026-09-11-mcp-server-design.md`。
