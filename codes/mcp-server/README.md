# Timia MCP Server (`timia-mcp`)

Local stdio MCP server that exposes Timia schedule, workspace, and item tools to agent hosts (Cursor, Claude Desktop, etc.). All calls go through core-service REST with a Personal Access Token (PAT).

## Install

From the repo root:

```bash
make mcp-server-install
```

Or directly:

```bash
cd codes/mcp-server && uv sync
```

Copy environment variables from `.env.example` or set them in your MCP host config.

## Create a Personal Access Token

1. Start core-service (`make core-service`) and log in via the web app to obtain a JWT.
2. Create a PAT with your JWT:

```bash
curl -s -X POST http://127.0.0.1:8000/auth/agent-tokens \
  -H "Authorization: Bearer <your-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"name": "cursor-local"}'
```

The response includes `token` (plaintext, shown once). Save it as `TIMIA_PAT` (`tm_pat_…` prefix).

## Cursor `mcp.json`

Add to `~/.cursor/mcp.json` (adjust the absolute path):

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

Run manually:

```bash
export TIMIA_API_BASE=http://127.0.0.1:8000
export TIMIA_PAT=tm_pat_…
uv run timia-mcp
```

## Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `TIMIA_API_BASE` | yes | — | core-service root URL |
| `TIMIA_PAT` | yes | — | Personal Access Token |
| `TIMIA_READONLY` | no | `false` | When `true`, blocks all write tools |
| `TIMIA_TOOL_PROFILE` | no | `p0` | Tool set: `p0`, `p1`, or `full` |
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

Delete-workspace and delete-project tools are intentionally **not** registered.

## Troubleshooting

### `unauthorized` (HTTP 401)

- PAT missing, revoked, or expired — create a new token via `POST /auth/agent-tokens`.
- Wrong `TIMIA_API_BASE` — must match the running core-service URL.
- Check stderr for JSON error logs from the MCP process.

### `readonly_mode`

- `TIMIA_READONLY=true` blocks all write tools (`create_item`, `update_item`, `complete_item`, `add_comment`, `parse_natural_language`, etc.).
- Set `TIMIA_READONLY=false` or remove the variable to allow writes.

### `version_conflict` (HTTP 409)

- Item was modified since you last read it. Call `get_item` or `list_items` to fetch the current `version`, then retry `update_item` or `complete_item` with that version.

## Tests

```bash
make mcp-server-test
```

Design spec: [docs/superpowers/specs/2026-09-11-mcp-server-design.md](../../docs/superpowers/specs/2026-09-11-mcp-server-design.md)
