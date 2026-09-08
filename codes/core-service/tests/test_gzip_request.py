"""Unit tests for gzip request body decoding (no database)."""

from __future__ import annotations

import gzip
import zlib

import pytest

from app.middleware.gzip_request import _decompress_gzip_body


def test_decompress_standard_gzip():
    raw = b'{"timezone":"Asia/Shanghai","samples":[]}'
    assert _decompress_gzip_body(gzip.compress(raw)) == raw


def test_decompress_zlib_payload_inside_gzip_header():
    raw = b'{"timezone":"Asia/Shanghai","samples":[]}'
    wrapped = b"\x1f\x8b\x08\x00\x00\x00\x00\x00\x00\xff" + zlib.compress(raw) + b"\x00" * 8
    assert _decompress_gzip_body(wrapped) == raw


def test_decompress_corrupt_gzip_deflate_raises():
    payload = b"\x1f\x8b\x08\x00\x00\x00\x00\x00\x00\xff" + b"\xff" * 32 + b"\x00" * 8
    with pytest.raises((OSError, EOFError, zlib.error)):
        _decompress_gzip_body(payload)


def test_decompress_not_gzip_raises():
    with pytest.raises((OSError, EOFError, zlib.error)):
        _decompress_gzip_body(b"not-gzip")
