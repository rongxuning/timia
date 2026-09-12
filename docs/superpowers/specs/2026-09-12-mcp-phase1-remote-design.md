# Timia MCP Phase 1 — Remote HTTP & Production Design

**Date:** 2026-09-12  
**Branch:** `cursor/mcp-phase1-remote-9820`  
**Prerequisite:** Phase 0 merged (`codes/mcp-server` stdio + core-service PATs)  
**Scope:** Streamable HTTP 传输、按请求 PAT、生产 Docker/nginx `/mcp`、对接文档；可选审计查询 API  
**Out of scope（本阶段不做）:** notes/plans 新 tools、MCP resources/prompts、Web「Agent Tokens」设置页、健康域 tools、OAuth、多租户 SaaS 托管

## Goal

让 Cursor / 其他 MCP 宿主能通过 **HTTPS** 连接生产 Timia，而无需在本机长期持有代码仓库或 `uv run` 进程。

```
Cursor (remote MCP URL)
    │  HTTPS + Authorization: Bearer tm_pat_…
    ▼
https://timia.online/mcp
    │  nginx
    ▼
mcp-server:8100  (Streamable HTTP)
    │  HTTP Bearer PAT（透传或每请求注入）
    ▼
core-service:8000
```

本地 stdio（Phase 0）**保留**，与 HTTP 模式共存：`TIMIA_MCP_TRANSPORT=stdio|http`。

## Decisions (confirmed)

| Topic | Choice |
|-------|--------|
| 传输 | MCP **Streamable HTTP**（官方 Python SDK）；不新开自定义 REST 包装 |
| 路径 | 对外 `https://timia.online/mcp`；容器内监听 `0.0.0.0:8100`，应用路径 `/mcp` |
| 鉴权 | **每个 HTTP 请求**必须带 `Authorization: Bearer tm_pat_…`；禁止用进程级共享 PAT 服务多用户 |
| 进程级 `TIMIA_PAT` | **仅 stdio 模式必填**；HTTP 模式下可选（仅用于健康检查等无用户探测，生产默认不设） |
| 上游 API | `TIMIA_API_BASE=http://core-service:8000`（compose 内网）；对外文档写 `https://timia.online/core-service` 仅用于创建 PAT |
| 部署 | 新增 compose 服务 `mcp-server` + Dockerfile；nginx `location /mcp/` |
| 会话 | 无状态优先：每个 tool 调用用该请求的 PAT 建/复用短生命周期 httpx 客户端；不跨用户缓存 |
| 只读默认 | 生产可设 `TIMIA_READONLY=false`（由 PAT scopes 约束）；文档推荐个人 PAT 最小 scopes |
| 原 Phase 1 产品项 | notes/plans tools、resources/prompts、Web Token UI → **Phase 1b**（另开规格） |

### Rejected

| Alternative | Why |
|-------------|-----|
| 仅文档「本地 MCP 打生产 API」 | 已可用，但不满足「生产端 MCP」远程托管诉求 |
| 把 MCP 嵌进 core-service | 违背 Phase 0 边界；stdio/HTTP 生命周期不同 |
| 服务器全局一个 PAT | 多用户串权，不可接受 |
| 经典 SSE-only 旧传输 | SDK 已转向 Streamable HTTP；新对接以此为准 |

---

## 1. mcp-server 变更

### 1.1 Config

扩展 `Settings`（`env_prefix=TIMIA_`）：

| 字段 | Env | 默认 | 说明 |
|------|-----|------|------|
| `api_base` | `TIMIA_API_BASE` | 必填 | core-service 根 URL |
| `pat` | `TIMIA_PAT` | stdio 必填；http 可选 | 进程默认 PAT |
| `transport` | `TIMIA_MCP_TRANSPORT` | `stdio` | `stdio` \| `http` |
| `host` | `TIMIA_MCP_HOST` | `127.0.0.1` | http 模式绑定；compose 用 `0.0.0.0` |
| `port` | `TIMIA_MCP_PORT` | `8100` | |
| `mcp_path` | `TIMIA_MCP_PATH` | `/mcp` | Streamable HTTP 挂载路径 |
| `readonly` / `tool_profile` / `timeout_seconds` / `default_timezone` | 同 Phase 0 | | |

校验：

- `transport=stdio` → 缺 `TIMIA_PAT` 启动失败  
- `transport=http` → 允许无进程 PAT；每个 MCP 请求必须自带 Bearer，否则 401

### 1.2 入口

`main()`：

```text
settings = load_settings()
if settings.transport == "stdio":
    client = TimiaHttpClient(settings)  # uses settings.pat
    build_mcp(settings, client).run(transport="stdio")
else:
    run_http_server(settings)  # Starlette/uvicorn or SDK helper
```

HTTP 模式优先使用 SDK 提供的 Streamable HTTP 应用工厂（如 `mcp.server.fastmcp` / `streamable_http` 挂载）。若 SDK API 与版本有差异，允许用官方文档推荐的 ASGI app 挂到 `settings.mcp_path`，**tool 名与 Phase 0 契约不变**。

### 1.3 按请求 PAT

HTTP 模式下：

1. 从 `Authorization` 头解析 Bearer token（必须以 `tm_pat_` 开头）。  
2. 缺失/非法 → 401 JSON `{"error":"unauthorized","message":"..."}`（不要落到 tool 层）。  
3. 为该请求构建 `TimiaHttpClient`（`api_base` + 该 PAT），注入 `build_mcp` / tool runner。  
4. 请求结束关闭 client（或用短缓存：同一 PAT 在单连接生命周期内复用，**禁止**跨 PAT 复用）。

实现注意：FastMCP 全局单例若不好做 per-request client，可：

- 使用 `contextvars.ContextVar[TimiaHttpClient]` 在 ASGI middleware 设置；或  
- 每个 session/connection 一份 MCP 实例（以 SDK 能力为准，计划任务里验证）。

**验收标准：** 两个不同 PAT 并发调用 `whoami`，各自返回对应用户，互不串。

### 1.4 健康检查

`GET /health`（不在 `/mcp` 下，免鉴权）→ `{"ok": true, "transport": "http"}`。  
不调用 core-service（避免无 PAT 时误伤）；可选后续加 `GET /ready` 探测上游。

### 1.5 日志

- HTTP access：stderr 结构化 JSON（method, path, status, latency_ms；**禁止**打印完整 PAT）。  
- Tool 审计：继续 `POST /auth/agent-tokens/audit`（best-effort），使用**调用方 PAT**。

---

## 2. 生产部署

### 2.1 Dockerfile

`codes/mcp-server/Dockerfile`（对齐 core-service：python:3.12-slim + uv sync --frozen）：

```text
EXPOSE 8100
CMD: timia-mcp   # transport=http via env
```

### 2.2 docker-compose.prod.yml

新增服务：

```yaml
mcp-server:
  image: timia-mcp-server:prod
  build: { context: ./codes/mcp-server }
  restart: unless-stopped
  env_file: ${TIMIA_ENV_FILE}
  environment:
    TIMIA_API_BASE: http://core-service:8000
    TIMIA_MCP_TRANSPORT: http
    TIMIA_MCP_HOST: 0.0.0.0
    TIMIA_MCP_PORT: "8100"
    TIMIA_MCP_PATH: /mcp
    # TIMIA_PAT unset in prod HTTP mode
  expose: ["8100"]
  depends_on: [core-service]
```

`nginx` `depends_on` 增加 `mcp-server`。

### 2.3 nginx

```nginx
upstream timia_mcp_server {
    server mcp-server:8100;
}

location /mcp {
    proxy_pass http://timia_mcp_server;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Authorization $http_authorization;
    proxy_buffering off;
    proxy_read_timeout 3600s;
    proxy_send_timeout 3600s;
}
```

（最终 `proxy_pass` 是否带尾斜杠以 SDK 挂载路径实测为准；计划任务含一次 curl 联调。）

### 2.4 部署脚本

- `deploy/remote.sh` / `local.sh`：支持打包/构建 `mcp-server`（与 core/web 并列，可用 `PACK_SERVICES` 扩展）。  
- `.env.prod.example`：补充 MCP 相关变量注释。  
- `docs/deploy/cloud.md`：增加「MCP 远程」小节。

### 2.5 创建生产 PAT（不变）

仍走：

`POST https://timia.online/core-service/auth/agent-tokens` + Web JWT。

---

## 3. Cursor 对接（生产）

### 3.1 远程 URL（目标形态）

以 Cursor 当时支持的 remote MCP 配置为准（实现时核对最新 Cursor 文档）。预期类似：

```json
{
  "mcpServers": {
    "timia-prod": {
      "url": "https://timia.online/mcp",
      "headers": {
        "Authorization": "Bearer tm_pat_…"
      }
    }
  }
}
```

若某版 Cursor 仅支持 stdio：保留 Phase 0「本地进程 + `TIMIA_API_BASE=https://timia.online/core-service`」作为兼容路径，README 双写。

### 3.2 文档

更新 `codes/mcp-server/README.md`：

1. stdio 本地  
2. stdio 打生产 API  
3. **远程 HTTP 生产**（主推）

---

## 4. 可选：审计查询 API（同阶段小项）

core-service：

- `GET /auth/agent-tokens/audit?limit=50`  
- 鉴权：JWT 或带 `admin:tokens` 的 PAT  
- 仅返回当前用户自己的 `agent_tool_calls` 行（无跨用户）

非阻塞：可与 HTTP 传输并行，但 **不以 Web UI 为依赖**。

---

## 5. 非目标 / Phase 1b

| 项 | 去向 |
|----|------|
| sticky notes / plans MCP tools | Phase 1b |
| MCP resources & prompts | Phase 1b |
| Web 设置页管理 PAT | Phase 1b |
| 健康只读 tools | Phase 2 |
| 速率限制 / WAF 规则细化 | 运维跟进；本规格仅 nginx 超时与 TLS |

---

## 6. 测试与验收

### 自动化

- mcp-server：HTTP 模式启动 smoke（TestClient/ASGI）；无 Authorization → 401；错误 PAT → 401；mock core 下 `whoami` 200；双 PAT 不串用户（可用两个 mock transport）  
- 配置矩阵：stdio 缺 PAT 失败；http 缺 PAT 可启动  
- 现有 Phase 0 tool 单测保持全绿  

### 手工（生产或 staging）

1. 部署含 `mcp-server` 的 compose  
2. `curl -fsS https://timia.online/mcp` 或健康检查可达  
3. Cursor remote 配置 + PAT → `whoami` / `list_workspaces` / `get_schedule`  
4. 撤销 PAT 后调用失败  

### 验收标准

- [ ] `TIMIA_MCP_TRANSPORT=http` 下服务监听并挂载 `/mcp`  
- [ ] 生产 `https://timia.online/mcp` 经 TLS 可达  
- [ ] 请求级 PAT 生效，无全局共享用户上下文  
- [ ] stdio 模式回归不受影响  
- [ ] README 含生产 Cursor 配置  

---

## 7. 实现默认值

| 问题 | 决策 |
|------|------|
| ASGI 服务器 | `uvicorn`（mcp-server 增依赖） |
| SDK 挂载失败时 | 阻塞并改计划，不发明私有 JSON-RPC |
| CORS | MCP 非浏览器主路径；若需浏览器调试再开白名单 |
| 多副本 | 第一期单副本；无粘性会话假设（无状态） |
| 内网 API | compose 内用 `http://core-service:8000`，不绕公网 |
