"""Decompress gzip-encoded request bodies before route handlers run."""

from __future__ import annotations

import gzip
import logging

from starlette.datastructures import MutableHeaders
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

logger = logging.getLogger("health.sync")

# Cap decompressed body size to mitigate gzip bombs (20 MiB).
_MAX_DECOMPRESSED_BYTES = 20 * 1024 * 1024


class GzipRequestMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        encoding = (request.headers.get("content-encoding") or "").lower().strip()
        if encoding != "gzip":
            return await call_next(request)

        body = await request.body()
        try:
            decompressed = gzip.decompress(body)
        except OSError:
            return JSONResponse(status_code=400, content={"detail": "content_encoding_invalid"})

        if len(decompressed) > _MAX_DECOMPRESSED_BYTES:
            logger.warning(
                "gzip_body_too_large compressed=%s decompressed=%s",
                len(body),
                len(decompressed),
            )
            return JSONResponse(status_code=413, content={"detail": "gzip_body_too_large"})

        request._body = decompressed
        headers = MutableHeaders(scope=request.scope)
        headers["content-length"] = str(len(decompressed))
        if "content-encoding" in headers:
            del headers["content-encoding"]

        return await call_next(request)
