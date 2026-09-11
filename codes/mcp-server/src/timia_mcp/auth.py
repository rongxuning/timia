from __future__ import annotations

from timia_mcp.config import Settings
from timia_mcp.errors import ReadonlyError


def assert_writable(settings: Settings) -> None:
    if settings.readonly:
        raise ReadonlyError()
