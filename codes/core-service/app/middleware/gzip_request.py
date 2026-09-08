"""Decompress gzip-encoded request bodies before route handlers run."""

from __future__ import annotations

import gzip
import logging
import zlib

from starlette.datastructures import MutableHeaders
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

logger = logging.getLogger("health.sync")

# Cap decompressed body size to mitigate gzip bombs (20 MiB).
_MAX_DECOMPRESSED_BYTES = 20 * 1024 * 1024
_GZIP_MAGIC = b"\x1f\x8b"


class GzipRequestMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        encoding = (request.headers.get("content-encoding") or "").lower().strip()
        if encoding != "gzip":
            return await call_next(request)

        body = await request.body()
        try:
            decompressed = _decompress_gzip_body(body)
        except (OSError, EOFError, zlib.error) as exc:
            logger.warning(
                "gzip_request_invalid body_len=%s err=%s",
                len(body),
                exc,
            )
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


def _decompress_gzip_body(body: bytes) -> bytes:
    try:
        return gzip.decompress(body)
    except (OSError, EOFError, zlib.error):
        pass
    # Clients that wrap a zlib (RFC 1950) payload in a gzip header.
    if len(body) > 18 and body.startswith(_GZIP_MAGIC):
        inner = body[10:-8]
        for wbits in (zlib.MAX_WBITS, -zlib.MAX_WBITS):
            try:
                return zlib.decompress(inner, wbits)
            except zlib.error:
                continue
    return gzip.decompress(body)
