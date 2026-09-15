from __future__ import annotations

from io import BytesIO

from PIL import Image, ImageOps

from app.core.config import settings


def process_image(data: bytes) -> tuple[bytes, int, int, bytes, int, int]:
    """Return original (exif-stripped jpeg/png/webp kept as jpeg), size, and thumb jpeg."""
    image = Image.open(BytesIO(data))
    image = ImageOps.exif_transpose(image)
    if image.mode not in {"RGB", "L"}:
        image = image.convert("RGB")
    width, height = image.size

    original_buf = BytesIO()
    image.save(original_buf, format="JPEG", quality=90, optimize=True)
    original_bytes = original_buf.getvalue()

    thumb = image.copy()
    thumb.thumbnail((settings.thumb_max_edge_px, settings.thumb_max_edge_px))
    thumb_buf = BytesIO()
    thumb.save(thumb_buf, format="JPEG", quality=80, optimize=True)
    tw, th = thumb.size
    return original_bytes, width, height, thumb_buf.getvalue(), tw, th
