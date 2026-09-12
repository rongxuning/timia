from __future__ import annotations

from typing import Any

import httpx

from timia_mcp.config import Settings


class TimiaHttpError(Exception):
    def __init__(self, status: int, detail: Any) -> None:
        self.status = status
        self.detail = detail
        super().__init__(f"HTTP {status}: {detail}")


class TimiaHttpClient:
    def __init__(self, settings: Settings, pat: str | None = None) -> None:
        token = pat if pat is not None else settings.pat
        if not token:
            raise ValueError("PAT is required to construct TimiaHttpClient")
        self._settings = settings
        self._client = httpx.AsyncClient(
            base_url=settings.api_base,
            headers={"Authorization": f"Bearer {token}"},
            timeout=settings.timeout_seconds,
        )

    async def request(self, method: str, path: str, **kwargs: Any) -> Any:
        response = await self._client.request(method, path, **kwargs)
        if response.is_success:
            if response.status_code == 204 or not response.content:
                return None
            return response.json()

        detail: Any
        try:
            body = response.json()
            detail = body.get("detail", body) if isinstance(body, dict) else body
        except ValueError:
            detail = response.text
        raise TimiaHttpError(response.status_code, detail)

    async def aclose(self) -> None:
        await self._client.aclose()
