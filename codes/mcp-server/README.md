# Timia MCP Server (`timia-mcp`)

MCP server for Timia schedule, workspace, and item tools. Calls go through
core-service REST with a Personal Access Token (`tm_pat_…`).

Supports two transports:

| Mode | When to use |
|------|-------------|
| **stdio** (default) | Local Cursor / Claude Desktop process |
| **http** (Streamable HTTP) | Hosted at `https://timia.online/mcp` |

## Install

```bash
make mcp-server-install
# or: cd codes/mcp-server && uv sync
```

## Create a PAT

1. Start core-service (`make core-service`) and obtain a Web JWT.
2. Mint a PAT:

```bash
# local
curl -s -X POST http://127.0.0.1:8000/auth/agent-tokens \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"name":"cursor-local"}'

# production
curl -s -X POST https://timia.online/core-service/auth/agent-tokens \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"name":"cursor-prod"}'
```

Save the one-time `token` value (`tm_pat_…`).

## Mode A — stdio → local API

`~/.cursor/mcp.json`:

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

## Mode B — stdio → production API

Same as Mode A, but point at production core-service (no hosted MCP required):

```json
{
  "mcpServers": {
    "timia-prod-api": {
      "command": "uv",
      "args": ["--directory", "/abs/path/codes/mcp-server", "run", "timia-mcp"],
      "env": {
        "TIMIA_API_BASE": "https://timia.online/core-service",
        "TIMIA_PAT": "tm_pat_…",
        "TIMIA_TOOL_PROFILE": "p0"
      }
    }
  }
}
```

## Mode C — remote HTTP (production MCP)

After deploy, Cursor connects over HTTPS (no local `uv` process):

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

Health check (no auth):

```bash
curl -fsS https://timia.online/mcp-health
# {"ok":true,"transport":"http"}
```

Local HTTP for debugging:

```bash
make mcp-server-http
# TIMIA_API_BASE=http://127.0.0.1:8000 TIMIA_MCP_TRANSPORT=http \
#   TIMIA_MCP_HOST=127.0.0.1 uv run timia-mcp
```

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TIMIA_API_BASE` | yes | — | core-service root URL |
| `TIMIA_PAT` | stdio: yes; http: no | — | Process PAT (HTTP uses per-request Bearer) |
| `TIMIA_MCP_TRANSPORT` | no | `stdio` | `stdio` or `http` |
| `TIMIA_MCP_HOST` | no | `127.0.0.1` | HTTP bind host (`0.0.0.0` in compose) |
| `TIMIA_MCP_PORT` | no | `8100` | HTTP port |
| `TIMIA_MCP_PATH` | no | `/mcp` | Streamable HTTP mount path |
| `TIMIA_READONLY` | no | `false` | When `true`, blocks write tools |
| `TIMIA_TOOL_PROFILE` | no | `p0` | `p0`, `p1`, or `full` |
| `TIMIA_TIMEOUT_SECONDS` | no | `30` | HTTP timeout per request |
| `TIMIA_DEFAULT_TIMEZONE` | no | `Asia/Shanghai` | Default timezone for schedule tools |

## P0 tools (`TIMIA_TOOL_PROFILE=p0`)

| Tool | Scope | Description |
|------|-------|-------------|
| `whoami` | `profile:read` | Current user identity |
| `list_workspaces` | `workspace:read` | Workspaces the user belongs to |
| `list_projects` | `workspace:read` | Projects in a workspace |
| `get_workspace_dashboard` | `workspace:read` | Workspace home dashboard |
| `get_project_dashboard` | `workspace:read` | Project home dashboard |
| `get_activity` | `workspace:read` | Recent workspace activity |
| `list_comments` | `workspace:read` | Comments on an item |
| `add_comment` | `workspace:write` | Add a comment to an item |
| `get_schedule` | `schedule:read` | Calendar items (day/week/month) |
| `get_schedule_dashboard` | `schedule:read` | Personal schedule dashboard |
| `list_overdue` | `schedule:read` | Overdue items |
| `list_undated` | `schedule:read` | Items without dates |
| `list_priority` | `schedule:read` | Priority quadrant items |
| `get_item` | `schedule:read` | Single item summary |
| `list_items` | `schedule:read` | Items in a project |
| `create_item` | `schedule:write` | Create a schedule item |
| `update_item` | `schedule:write` | Update an item (requires `version`) |
| `complete_item` | `schedule:write` | Mark item done |
| `parse_natural_language` | `schedule:write` | Parse NL text into a draft (no persist) |

## Troubleshooting

### HTTP 401 / `unauthorized`

- Missing or non-`tm_pat_…` `Authorization` header (remote HTTP).
- PAT revoked or expired — mint a new one via `POST /auth/agent-tokens`.
- Wrong `TIMIA_API_BASE` for stdio mode.

### nginx 502 / timeouts

- Confirm `mcp-server` is up: `docker compose ps mcp-server`.
- `/mcp` uses `proxy_buffering off` and long read timeouts; reload nginx after config changes.
- DNS rebinding: Host must be `timia.online` (allowed in the HTTP app).

### TLS / Cursor remote

- URL must be `https://timia.online/mcp` (not the container port).
- If Cursor only supports stdio, use Mode B.

### `readonly_mode`

- `TIMIA_READONLY=true` blocks write tools. Set `false` or omit.

### `version_conflict` (HTTP 409)

- Re-fetch `version` via `get_item` / `list_items`, then retry.

## Tests

```bash
make mcp-server-test
```

- Design: [Phase 0](../../docs/superpowers/specs/2026-09-11-mcp-server-design.md) · [Phase 1 remote](../../docs/superpowers/specs/2026-09-12-mcp-phase1-remote-design.md)
- Deploy: [docs/deploy/cloud.md](../../docs/deploy/cloud.md) (MCP section)
