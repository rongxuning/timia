from __future__ import annotations

from typing import Any

from timia_mcp.http_client import TimiaHttpClient


async def emit_audit(
    client: TimiaHttpClient,
    tool_name: str,
    ok: bool,
    error_detail: str | None,
    latency_ms: int,
    request_meta: dict[str, Any],
) -> None:
    try:
        await client.request(
            "POST",
            "/auth/agent-tokens/audit",
            json={
                "tool_name": tool_name,
                "ok": ok,
                "error_detail": error_detail,
                "latency_ms": latency_ms,
                "request_meta": request_meta,
            },
        )
    except Exception:  # noqa: BLE001, S110 — audit is best-effort
        pass
