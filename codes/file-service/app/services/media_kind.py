from __future__ import annotations

import re
import uuid

IMAGE_MAX_BYTES = 10 * 1024 * 1024
VIDEO_MAX_BYTES = 200 * 1024 * 1024
FILE_MAX_BYTES = 20 * 1024 * 1024

KIND_IMAGE = "image"
KIND_VIDEO = "video"
KIND_FILE = "file"
KINDS = frozenset({KIND_IMAGE, KIND_VIDEO, KIND_FILE})

VARIANTS = frozenset({"original", "thumb", "poster"})

_SAFE_FILENAME = re.compile(r"[^A-Za-z0-9._-]+")


class UploadRejected(ValueError):
    """detail is a snake_case error code."""


def sanitize_filename(name: str) -> str:
    raw = (name or "file").split("/")[-1].split("\\")[-1].strip() or "file"
    cleaned = _SAFE_FILENAME.sub("_", raw).strip("._") or "file"
    return cleaned[:255]


def object_key_for(file_id: uuid.UUID, variant: str = "original") -> str:
    if variant not in VARIANTS:
        raise ValueError("invalid_variant")
    return f"files/{file_id}/{variant}"


def _is_jpeg(data: bytes) -> bool:
    return data.startswith(b"\xff\xd8\xff")


def _is_png(data: bytes) -> bool:
    return data.startswith(b"\x89PNG\r\n\x1a\n")


def _is_webp(data: bytes) -> bool:
    return len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP"


def _is_mp4(data: bytes) -> bool:
    return len(data) >= 12 and data[4:8] == b"ftyp"


def _is_pdf(data: bytes) -> bool:
    return data.startswith(b"%PDF")


def _is_zip(data: bytes) -> bool:
    return data.startswith((b"PK\x03\x04", b"PK\x05\x06"))


def sniff_mime(data: bytes) -> str | None:
    if _is_jpeg(data):
        return "image/jpeg"
    if _is_png(data):
        return "image/png"
    if _is_webp(data):
        return "image/webp"
    if _is_mp4(data):
        return "video/mp4"
    if _is_pdf(data):
        return "application/pdf"
    if data.startswith((b"{", b"[")):
        return None
    if _is_zip(data):
        return "application/zip"
    if data.lstrip().startswith(b"#") or b"\n" in data[:1024]:
        try:
            data[:1024].decode("utf-8")
        except UnicodeDecodeError:
            return None
        return "text/plain"
    return None


def mime_for_kind(kind: str, sniffed: str) -> bool:
    if kind == KIND_IMAGE:
        return sniffed in {"image/jpeg", "image/png", "image/webp"}
    if kind == KIND_VIDEO:
        return sniffed in {"video/mp4", "video/quicktime"}
    if kind == KIND_FILE:
        return sniffed in {
            "application/pdf",
            "application/zip",
            "text/plain",
            "text/markdown",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        }
    return False


def max_bytes_for_kind(kind: str) -> int:
    if kind == KIND_IMAGE:
        return IMAGE_MAX_BYTES
    if kind == KIND_VIDEO:
        return VIDEO_MAX_BYTES
    if kind == KIND_FILE:
        return FILE_MAX_BYTES
    raise UploadRejected("invalid_kind")


def sniff_upload(*, kind: str, data: bytes, declared_mime: str | None) -> str:
    if kind not in KINDS:
        raise UploadRejected("invalid_kind")
    if not data:
        raise UploadRejected("empty_file")
    if len(data) > max_bytes_for_kind(kind):
        raise UploadRejected("file_too_large")
    sniffed = sniff_mime(data)
    if declared_mime == "video/quicktime" and _is_mp4(data):
        sniffed = "video/quicktime"
    if declared_mime == "text/markdown" and sniffed == "text/plain":
        sniffed = "text/markdown"
    if declared_mime == (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    ) and sniffed == "application/zip":
        sniffed = declared_mime
    if sniffed is None or not mime_for_kind(kind, sniffed):
        raise UploadRejected("unsupported_media_type")
    return sniffed


def escape_like(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
