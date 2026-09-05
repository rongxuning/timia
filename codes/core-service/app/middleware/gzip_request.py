"""Decompress gzip-encoded request bodies before route handlers run."""

from __future__ import annotations

import gzip

from starlette.datastructures import MutableHeaders
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response


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

        request._body = decompressed
        headers = MutableHeaders(scope=request.scope)
        headers["content-length"] = str(len(decompressed))
        if "content-encoding" in headers:
            del headers["content-encoding"]

        return await call_next(request)
