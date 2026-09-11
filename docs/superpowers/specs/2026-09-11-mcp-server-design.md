# Timia MCP Server Design

**Date:** 2026-09-11  
**Branch:** `cursor/mcp-server-design-spec-9820`  
**Scope:** 独立包 `codes/mcp-server` + core-service 侧 Agent Token / 审计最小支持  
**Out of scope（本规格第一期不做）:** OAuth 授权码流、远程多租户托管 SaaS、把 OpenAPI 100+ 路径 1:1 暴露为 tools、HealthKit sync 写接口、在 MCP 内再接一套 LLM、Android、通知推送

## Goal

为 Timia 提供一套 **Model Context Protocol（MCP）** 服务，让 Cursor / Claude Desktop / 其他 agent 宿主能以「用户身份」安全读写日程、任务、协作上下文，而无需 agent 手写 REST。

MCP 是 **agent 操作面**：意图化 tools + 少量 resources/prompts。业务逻辑、权限、数据仍全部在 `codes/core-service`。

## Decisions (confirmed)

| Topic | Choice |
|-------|--------|
| 包形态 | 独立包 `codes/mcp-server`（Python ≥3.11，uv），不嵌入 core-service 进程 |
| 与 API 关系 | MCP **只调用** core-service HTTP；不直连 Postgres、不复制权限逻辑 |
| 鉴权 | **Personal Access Token（PAT）** 不透明串（非 JWT）；明文只展示一次，库内存 hash；前缀 `tm_pat_` |
| 不用现有凭证 | 不复用 web refresh cookie、不复用 iOS device challenge |
| 传输 P0 | **stdio**（本地 Cursor / Claude Desktop） |
| 传输 P1 | **Streamable HTTP**（远程 agent；挂在 `/mcp` 或独立端口） |
| Tool 粒度 | 按 agent 任务封装，优先 `/views/*` + 高频 item 写操作；禁止裸 CRUD 洪水 |
| 危险写 | P0 **不注册**删除 workspace/project、清健康数据等 tool；若未来开放，必须 `confirm=true` |
| LLM | 复用 core-service 已有 NL parse / sticky AI parse；MCP 内不持有 MiniMax key |
| 语言 | tool description / prompt 文案默认英文（MCP 宿主生态）；错误码 snake_case 与 API 对齐 |
| 包管理 | 与 core-service 一致：uv + Ruff；测试 pytest |

### Rejected alternatives

| Alternative | Why rejected |
|-------------|--------------|
| A. 在 core-service 内嵌 MCP 路由 | 耦合部署与依赖；stdio 本地启动不自然；agent 宿主更习惯独立进程 |
| B. 纯 OpenAPI→MCP 自动生成 | tool 过多、描述差、容易越权调用冷门/危险接口 |
| C. 直接塞用户 JWT 进 mcp.json | 短生命周期、难撤销、与 web/mobile session 纠缠 |

---

## 1. 架构

```
┌─────────────────────┐     stdio / HTTP      ┌──────────────────┐
│ Agent Host          │ ────────────────────► │ codes/mcp-server │
│ (Cursor, Claude…)   │ ◄──────────────────── │  MCP protocol    │
└─────────────────────┘                       └────────┬─────────┘
                                                       │ HTTPS Bearer PAT
                                                       ▼
                                              ┌──────────────────┐
                                              │ codes/core-service│
                                              │ REST + permissions│
                                              └──────────────────┘
```

### 1.1 职责边界

| 组件 | 负责 | 不负责 |
|------|------|--------|
| `mcp-server` | MCP handshake、tool/resource/prompt 注册、入参校验、调用编排、响应裁剪、本地配置 | 业务规则、DB、JWT 签发（除本地转发）、LLM |
| `core-service` | 鉴权（含 PAT）、权限、CRUD、views、NL parse、activity / mcp 审计 | MCP 协议细节 |
| Agent Host | 选 tool、多轮对话、展示确认 | Timia 领域逻辑 |

### 1.2 进程与配置

`mcp-server` 启动时读取环境变量（也可由宿主 `mcp.json` 的 `env` 注入）：

| 变量 | 必填 | 含义 | 默认 |
|------|------|------|------|
| `TIMIA_API_BASE` | 是 | core-service 根 URL，如 `https://timia.online/core-service` 或 `http://127.0.0.1:8000` | — |
| `TIMIA_PAT` | 是* | 用户 PAT 明文（stdio 本地） | — |
| `TIMIA_READONLY` | 否 | `true` 时拒绝一切写 tool | `false` |
| `TIMIA_TOOL_PROFILE` | 否 | `p0` / `p1` / `full` | `p0` |
| `TIMIA_TIMEOUT_SECONDS` | 否 | 单次 HTTP 超时 | `30` |
| `TIMIA_DEFAULT_TIMEZONE` | 否 | 日程类默认时区 | `Asia/Shanghai` |

\*Streamable HTTP 模式下，PAT 可来自请求头 `Authorization: Bearer …`，此时进程级 `TIMIA_PAT` 可选。

本地 Cursor 示例（`~/.cursor/mcp.json`）：

```json
{
  "mcpServers": {
    "timia": {
      "command": "uv",
      "args": ["--directory", "/abs/path/codes/mcp-server", "run", "timia-mcp"],
      "env": {
        "TIMIA_API_BASE": "http://127.0.0.1:8000",
        "TIMIA_PAT": "tm_pat_…",
        "TIMIA_TOOL_PROFILE": "p0"
      }
    }
  }
}
```

---

## 2. 鉴权与安全（core-service 变更）

### 2.1 Agent PAT 模型

新表 `agent_tokens`：

| 列 | 类型 | 说明 |
|----|------|------|
| `id` | uuid PK | |
| `user_id` | uuid FK → users | 令牌所属用户 |
| `name` | varchar(80) | 用户可见标签，如 `cursor-laptop` |
| `token_prefix` | varchar(16) | 明文前缀，用于列表展示（如 `tm_pat_ab12`） |
| `token_hash` | varchar(64) | SHA-256 hex（或与现有 password 风格一致的单向 hash；**不得**可逆） |
| `scopes` | jsonb | string 数组，见 §2.2 |
| `expires_at` | timestamptz null | null = 不过期 |
| `revoked_at` | timestamptz null | |
| `last_used_at` | timestamptz null | |
| `created_at` / `updated_at` | timestamptz | mixin |

明文格式：`tm_pat_` + **32 bytes** url-safe 随机串（约 43 字符 body）。创建接口响应 **仅一次** 返回 `token` 全文；之后列表只返回 `token_prefix`。

### 2.2 Scopes

| Scope | 允许的能力 |
|-------|------------|
| `profile:read` | whoami、用户目录只读 |
| `schedule:read` | 日程 views、item 读、dashboard |
| `schedule:write` | 创建/更新/完成 item；NL parse（parse 本身不写库，但属写路径 profile） |
| `workspace:read` | workspace/project 列表与 dashboard、activity、comments 读 |
| `workspace:write` | 评论写入；成员只读外的协作写（第一期：**不含**增删成员、删 workspace/project） |
| `notes:read` / `notes:write` | 便签 |
| `plans:read` / `plans:write` | 规划模板发现/订阅/导入 |
| `health:read` | 健康只读 views |
| `admin:tokens` | 管理自己的 PAT（默认创建者自带） |

**默认创建 scopes（P0）：**  
`profile:read`, `schedule:read`, `schedule:write`, `workspace:read`, `workspace:write`, `admin:tokens`

`TIMIA_READONLY=true` 时 mcp-server 在本地拦截写 tool，即便 PAT 含 write scope。

### 2.3 JWT / 请求认证路径

采用：

1. MCP → core-service 每个请求带 `Authorization: Bearer <tm_pat_…>`。
2. `get_current_user` 扩展：若 token 以 `tm_pat_` 开头，则走 PAT 校验（查 hash、未撤销、未过期、校验 scopes、更新 `last_used_at`），返回与现网一致的 `User`；**不**把 PAT 兑换成 JWT（P0）。
3. 现有 JWT `aud` 校验保持：`timia-web` / `timia-ios` 不变；PAT 路径 **不** 进入 `decode_access_token`。

### 2.4 HTTP API（core-service）

挂在 `/auth/agent-tokens`（需已登录的 web/mobile 用户管理自己的 PAT）：

| Method | Path | 说明 |
|--------|------|------|
| `GET` | `/auth/agent-tokens` | 列表（无明文） |
| `POST` | `/auth/agent-tokens` | 创建；body: `{ name, scopes?, expires_at? }`；响应含一次性 `token` |
| `DELETE` | `/auth/agent-tokens/{id}` | 撤销（设 `revoked_at`） |

权限：仅操作自己的 token；`system_admin` 不额外扩大为可管他人（防误用；若需运维再开）。

第一期 **不做** Web UI；可用 API / 临时脚本创建。Web「设置 → Agent Tokens」列为 P1 产品项，不阻塞 MCP。

### 2.5 审计

新表可选 `agent_tool_calls`（或复用 `activity_logs` 并扩展 `entity_type=agent_tool`）：

独立表 `agent_tool_calls`（不写入 `activity_logs`，避免污染 workspace 活动 UI）：

| 列 | 说明 |
|----|------|
| `id`, `user_id`, `token_id` | |
| `tool_name` | 如 `create_item` |
| `ok` | bool |
| `error_detail` | 可空，snake_case |
| `latency_ms` | int |
| `request_meta` | jsonb：裁剪后的参数摘要（禁止存 PAT、密码；item body 最长 200 字） |
| `created_at` | |

写入路径（P0 全做）：

1. mcp-server：每次 tool 结束打 **stderr JSON 结构化日志**（必有）。
2. mcp-server：best-effort `POST /auth/agent-tokens/audit`（失败不阻断 tool 响应）。
3. core-service：落地 `agent_tool_calls`；P0 **不提供**审计查询 API（P1 再加 `GET`）。

### 2.6 护栏

- mcp-server 默认 **不注册** 删除 workspace / 删除 project / 清空健康数据 的 tool。
- `update_item` 改 `status=archived` 或跨项目移动需要调用方传当前 `version`（乐观锁）；冲突返回 `version_conflict`。
- 任何 tool 若对应 HTTP 403/404，原样映射为 MCP tool error（见 §6），不泄露「是否存在」以外的跨权限数据。

---

## 3. 包结构（`codes/mcp-server`）

```
codes/mcp-server/
├── pyproject.toml          # name: timia-mcp-server; script: timia-mcp
├── README.md
├── .env.example
├── src/timia_mcp/
│   ├── __init__.py
│   ├── __main__.py         # python -m timia_mcp
│   ├── server.py           # 组装 FastMCP / Server，注册 tools
│   ├── config.py           # 环境变量
│   ├── auth.py             # 读取 PAT、只读开关
│   ├── http_client.py      # httpx AsyncClient 封装
│   ├── errors.py           # 统一错误 → MCP 文本/结构化
│   ├── profiles.py         # p0/p1/full 哪些 tool 启用
│   ├── tools/
│   │   ├── __init__.py     # register_all(server)
│   │   ├── profile.py      # whoami
│   │   ├── schedule.py
│   │   ├── items.py
│   │   ├── workspace.py
│   │   ├── notes.py        # P1
│   │   ├── plans.py        # P1
│   │   └── health.py       # P2
│   ├── resources/
│   │   └── catalog.py      # P1
│   └── prompts/
│       └── catalog.py      # P1
└── tests/
    ├── conftest.py         # respx/httpx mock
    ├── test_config.py
    ├── test_profile_tools.py
    ├── test_schedule_tools.py
    ├── test_items_tools.py
    └── test_readonly_guard.py
```

技术选型：

- 官方 Python MCP SDK（`mcp` 包）+ 优先使用其 **FastMCP** 风格注册 tools（若 SDK 版本 API 有变，以可测的 `Server` + decorator 为准）。
- HTTP：`httpx` async。
- Schema：工具入参用 Pydantic v2 模型，再导出 JSON Schema。

Makefile 根目标（本规格要求补上）：

- `make mcp-server` → 文档化运行方式；本地 stdio 一般由宿主拉起，CI 用 `uv run pytest`。
- `make mcp-server-install` → `cd codes/mcp-server && uv sync`

---

## 4. Tools 规格

### 4.0 通用约定

- 所有 tool 名：`snake_case`，与 Timia 领域词一致。
- 时间字段：ISO-8601；未带时区则按 `TIMIA_DEFAULT_TIMEZONE` 解释。
- UUID：string。
- 成功返回：**短 JSON 文本**（MCP text content），字段已裁剪；列表默认 `limit≤50`。
- 写操作成功后若有 `version`，必须返回，便于后续 update。
- Profile 过滤：未启用的 tool 直接不注册（宿主看不见），不是注册后报错。

### 4.1 P0 Tools（`TIMIA_TOOL_PROFILE=p0`）

#### `whoami`

- **Scope:** `profile:read`
- **Maps to:** `GET /auth/me`
- **Input:** 无
- **Output:** `{ id, email, display_name, system_role }`

#### `list_workspaces`

- **Scope:** `workspace:read`
- **Maps to:** `GET /workspaces`（或 cards，若更短则优先 cards 再按需展开）
- **Input:** 可选 `{ favorite_only?: bool }`
- **Output:** `[{ id, name, role, is_favorite }]`

#### `list_projects`

- **Scope:** `workspace:read`
- **Maps to:** `GET /workspaces/{workspace_id}/projects`
- **Input:** `{ workspace_id: str }`
- **Output:** `[{ id, name, archived }]`

#### `get_schedule`

- **Scope:** `schedule:read`
- **Maps to:** `GET /views/schedule/calendar`（主）；可选参数对应 query
- **Input:**
  ```
  {
    view: "day" | "week" | "month",      # default week
    anchor?: str,                        # YYYY-MM-DD
    scope?: "me" | "project",            # default me
    workspace_id?: str,
    project_id?: str,
    timezone?: str
  }
  ```
- **Output:** 裁剪后的日历条目列表（id, title, status, start_at, end_at, project_id, workspace_id, priority），去掉纯 UI 布局噪声。

#### `get_schedule_dashboard`

- **Scope:** `schedule:read`
- **Maps to:** `GET /views/schedule/dashboard`
- **Input:** 无
- **Output:** dashboard 摘要（今日/即将/计数等已有字段，去掉无用嵌套）。

#### `list_overdue` / `list_undated` / `list_priority`

- **Scope:** `schedule:read`
- **Maps to:** 对应 `/views/schedule/overdue|undated|priority`
- **Input:** `{ scope?: "me"|"project", workspace_id?, project_id?, timezone? }`
- **Output:** 条目摘要列表。

#### `get_item`

- **Scope:** `schedule:read`（item 详情也用于协作；第一期不另拆 scope）
- **Maps to:** `GET /views/workspace/{ws}/projects/{pj}/items/{id}/detail` 优先；若缺 ws/pj 则先用 list 路径不可——**要求调用方提供** `workspace_id`, `project_id`, `item_id`
- **Input:** `{ workspace_id, project_id, item_id }`
- **Output:** 详情裁剪（含 comments 摘要可选 `include_comments?: bool` default false）

#### `list_items`

- **Scope:** `schedule:read`
- **Maps to:** `GET /workspaces/{ws}/projects/{pj}/items`
- **Input:** `{ workspace_id, project_id, status?: str, limit?: int }`
- **Output:** 摘要列表 + `version`

#### `create_item`

- **Scope:** `schedule:write`
- **Maps to:** `POST /workspaces/{ws}/projects/{pj}/items`
- **Input:** 对齐 `ItemCreate` 核心字段：
  ```
  {
    workspace_id, project_id,
    title: str,
    body?: str,
    status?: str,           # default todo
    priority?: str,         # default "1"
    start_at?: str,
    end_at?: str,
    location?: str,
    details?: str,
    assignee_user_id?: str,
    participant_user_ids?: str[],
    color?: str,
    repeat?: "none"|"daily"|"weekly"|"monthly"
  }
  ```
- **Output:** `{ id, version, title, start_at, end_at, status }`

#### `update_item`

- **Scope:** `schedule:write`
- **Maps to:** `PATCH .../items/{item_id}`
- **Input:** `{ workspace_id, project_id, item_id, version: int, ...ItemUpdate 可选字段 }`
- **Output:** 更新后摘要；`409` → error `version_conflict`

#### `complete_item`

- **Scope:** `schedule:write`
- **Maps to:** `update_item` 快捷封装：`status=done` + 可选 `completed_at=now`
- **Input:** `{ workspace_id, project_id, item_id, version: int }`
- **Output:** 同 `update_item`

#### `parse_natural_language`

- **Scope:** `schedule:write`（消耗服务端 LLM）
- **Maps to:** `POST /views/schedule/natural-language/parse`
- **Input:** 与现有 `NaturalLanguageParseRequest` 对齐（至少 `text`；其余字段按 OpenAPI）
- **Output:** 解析草稿（**不落库**）；agent 再用 `create_item` 确认写入

#### `get_workspace_dashboard` / `get_project_dashboard`

- **Scope:** `workspace:read`
- **Maps to:** `/views/workspace/...`
- **Input:** 对应 id
- **Output:** 裁剪后的仪表盘 JSON

#### `get_activity`

- **Scope:** `workspace:read`
- **Maps to:** `GET /views/workspace/{id}/activity`
- **Input:** `{ workspace_id, limit?: int }`
- **Output:** 最近活动摘要

#### `list_comments` / `add_comment`

- **Scope:** read → `workspace:read`；write → `workspace:write`
- **Maps to:** item comments REST
- **Input:** 标准 ids + `body`（写）

### 4.2 P1 Tools（`p1` = P0 ∪ 下列）

| Tool | Scope | Maps to |
|------|-------|---------|
| `list_sticky_notes` | `notes:read` | `GET /sticky-notes` |
| `create_sticky_note` | `notes:write` | `POST /sticky-notes` |
| `ai_parse_sticky_note` | `notes:write` | `POST /sticky-notes/{id}/ai-parse` |
| `convert_sticky_note` | `notes:write` | `POST /sticky-notes/{id}/convert` |
| `search_plans` | `plans:read` | `GET /views/plans` |
| `get_plan` | `plans:read` | `GET /views/plans/{id}` |
| `subscribe_plan` | `plans:write` | subscribe + 必要参数 |
| `import_plan_period` | `plans:write` | import-current-period / apply 确认流 |
| `list_plan_notifications` | `plans:read` | `GET /views/plan-notifications` |

P1 导入/订阅类必须在 tool description 中写明「会创建真实任务」，并要求完整 `workspace_id` + `project_id`。

### 4.3 P2 Tools（`full`）

| Tool | Scope | Notes |
|------|-------|-------|
| `get_health_summary` | `health:read` | `GET /views/me/health` |
| `list_workouts` / `get_workout` | `health:read` | |
| `get_health_metric` | `health:read` | card detail |

**永不暴露：** `/health/sync/*`、`DELETE /health/data`、`/dev/*`、成员角色变更、删 workspace/project（除非未来单独 `destructive` profile + 强制 `confirm`）。

---

## 5. Resources & Prompts（P1）

### 5.1 Resources（只读 URI）

| URI | 内容 |
|-----|------|
| `timia://me` | whoami 快照 |
| `timia://schedule/today` | 今日 `get_schedule(view=day)` |
| `timia://workspace/{workspace_id}` | dashboard 摘要 |
| `timia://item/{workspace_id}/{project_id}/{item_id}` | item 详情 |

Resources 与 tools 共用 http client；404/403 按 MCP resource 错误返回。

### 5.2 Prompts

| Name | 用途 | 参数 |
|------|------|------|
| `daily_briefing` | 拉取今日日程 + overdue，生成简报话术指引 | `timezone?` |
| `triage_overdue` | 列出逾期并建议完成/改期步骤 | `workspace_id?` |
| `nl_to_schedule` | 引导：先 parse 再请用户确认 create | `text` |
| `sticky_to_item` | 引导便签 AI parse → convert | `note_id` |

Prompts 只提供消息模板，不自动写库。

---

## 6. 错误模型

mcp-server 将 HTTP 错误转为 tool 结果文本（或 `isError=true`），稳定格式：

```json
{
  "error": "version_conflict",
  "http_status": 409,
  "message": "Item was modified; re-read and retry with new version."
}
```

映射表：

| HTTP | error |
|------|-------|
| 401 | `unauthorized`（PAT 无效/撤销） |
| 403 | API `detail` 原样（如 `not_a_member`） |
| 404 | `not_found` 或 API detail |
| 409 | `version_conflict` 等 |
| 400 | API detail |
| 超时/网络 | `upstream_unavailable` |
| 只读模式拦截 | `readonly_mode` |
| 缺 scope | `insufficient_scope`（若 core 返回专用码；否则 403） |

---

## 7. 传输

### 7.1 P0：stdio

- 入口：`timia-mcp` / `python -m timia_mcp`
- 日志写 **stderr**，禁止污染 stdout（MCP 帧通道）。

### 7.2 P1：Streamable HTTP

- 监听 `TIMIA_MCP_HOST:TIMIA_MCP_PORT`（默认 `127.0.0.1:8100`）
- 路径 `/mcp`
- 鉴权：每个请求 `Authorization: Bearer tm_pat_…`
- 生产经 nginx 反代；文档更新 `deploy/nginx.conf` 草案（实现阶段再改）

---

## 8. 分阶段交付

### Phase 0 — 可本地接入（本规格 MVP）

1. core-service：`agent_tokens` + `agent_tool_calls` 表与 migration；`/auth/agent-tokens` CRUD + `POST .../audit`；PAT 接入 `get_current_user` + scope 检查
2. `codes/mcp-server` 脚手架 + config + httpx client
3. P0 tools 全套（§4.1）
4. 只读模式、profile=`p0`
5. pytest + http mock（mcp）与 PAT 集成测试（core）
6. README：创建 PAT、Cursor `mcp.json` 示例、工具列表
7. 根 Makefile 目标 + 根 README 链接

**验收：** 用真实 PAT 在本地 Cursor 调用 `whoami`、`get_schedule`、`create_item`/`complete_item` 成功；无 PAT 时工具返回 `unauthorized`。

### Phase 1

- notes + plans tools
- resources + prompts
- Streamable HTTP
- Web「设置 → Agent Tokens」管理页
- `GET` 审计查询 API（本人）

### Phase 2

- health 只读 tools
- 只读 PAT 创建快捷选项（创建时一键勾选全部 `:read` scopes）
- 可选：PAT 兑换短期 `aud=timia-mcp` JWT（仅当网关/缓存有明确需求时）

---

## 9. 测试策略

| 层 | 内容 |
|----|------|
| mcp-server 单元 | 每个 tool：mock HTTP 200/401/403/409；断言调用 URL/method/json；只读拦截 |
| core-service | PAT 创建/撤销/过期/错误 hash；带 PAT 访问 `/auth/me` 与受保护 item 路由；缺 scope → 403 `insufficient_scope` |
| 手工 | Cursor 连本地 stdio：`whoami` → `get_schedule` → `create_item` → `complete_item` |

Scope 强制（P0 必做）：

- **权威位置：core-service**（PAT 认证成功后检查 scopes；缺则 `403 insufficient_scope`）。
- **辅助位置：mcp-server** 按 tool 声明的 scope 前置检查，错误码同为 `insufficient_scope`。
- 映射最小集：读 tool → 对应 `:read`；写 tool → 对应 `:write`；`whoami` → `profile:read`。

core-service 对 PAT 请求使用 **路径前缀 → 所需 scope** 表（不必给每个路由手写 Depends）。P0 最小映射：

| 路径前缀 / 模式 | 需要 scope |
|-----------------|------------|
| `GET /auth/me` | `profile:read` |
| `GET/POST/DELETE /auth/agent-tokens*` | `admin:tokens`（审计 POST 除外：持有任意有效 PAT 即可写自己的 audit） |
| `GET /workspaces*`、`GET /views/workspace*`、`GET /users*` | `workspace:read` |
| `POST/PATCH .../comments*` | `workspace:write` |
| `GET /views/schedule*`、`GET .../items*` | `schedule:read` |
| `POST/PATCH .../items*`、`POST /views/schedule/natural-language/parse` | `schedule:write` |
| 其他未映射路径 | PAT **拒绝**（`403 insufficient_scope` / `pat_path_not_allowed`），逼迫显式加白名单 |

Web/mobile JWT 请求 **不走** 该表，行为与现网一致。

---

## 10. 文档与仓库集成

- `codes/mcp-server/README.md`：安装、PAT、Cursor/Claude 配置、tool 表、故障排查
- 根 `README.md` 增一小节「MCP（Agent）」链接到上述 README 与本 spec
- 本 spec 路径：`docs/superpowers/specs/2026-09-11-mcp-server-design.md`
- 实现计划（批准本 spec 后另写）：`docs/superpowers/plans/2026-09-11-mcp-server.md`

---

## 11. 非目标重申 / 后续可开

- OAuth / 企业 SSO 给 agent
- 自动从 OpenAPI 生成全部 tools
- MCP 内嵌二次 LLM 编排（agent host 负责）
- 多用户共享一个 PAT
- 破坏性管理工具（删空间、清健康数据）

---

## 12. 实现默认值（无未决项）

| 问题 | 决策 |
|------|------|
| PAT hash | `SHA-256(hex)` of `token`，pepper = `settings.jwt_secret` 前缀拼接后再 hash：`SHA-256(jwt_secret + ":" + token)`；不用 bcrypt |
| Scope 强制 | P0 必做，core 权威 + mcp 前置（§9） |
| 审计 | P0：表 + stderr 日志 + `POST .../audit`；查询 API → P1 |
| Web UI 管理 PAT | P1 |
| MCP SDK 风格 | 优先 FastMCP；若 SDK API 不稳则改用底层 `Server`，**tool 名与入参契约不变** |
| `list_workspaces` 数据源 | 固定 `GET /workspaces`；输出按 §4.1 裁剪 |
