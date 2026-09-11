from __future__ import annotations

import json
from typing import Any


class ReadonlyError(Exception):
    def to_dict(self) -> dict[str, str]:
        return {
            "error": "readonly_mode",
            "message": "Write operations are disabled in readonly mode",
        }


def tool_error_from_http(status: int, detail: Any) -> dict:
    if status == 401:
        code = "unauthorized"
    elif status == 404:
        code = detail if isinstance(detail, str) else "not_found"
    elif status == 409:
        code = detail if isinstance(detail, str) else "version_conflict"
    elif status == 403:
        code = detail if isinstance(detail, str) else "forbidden"
    elif status == 400:
        code = detail if isinstance(detail, str) else "bad_request"
    else:
        code = "upstream_error"
    return {
        "error": code if isinstance(code, str) else "upstream_error",
        "http_status": status,
        "message": str(detail),
    }


def json_result(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, default=str)
