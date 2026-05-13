"""Remove dark / low-alpha scaling speckles on the right edge of favicon-sized PNGs."""

from __future__ import annotations

from pathlib import Path

from PIL import Image


def clean_right_edge_speckles(im: Image.Image, *, edge_cols: int | None = None) -> Image.Image:
    """Zero out junk pixels on the right margin (LANCZOS / crop artifacts)."""
    rgba = im.convert("RGBA")
    w, h = rgba.size
    cols = edge_cols if edge_cols is not None else max(3, (w + 5) // 6)
    x0 = max(0, w - cols)
    px = rgba.load()
    for x in range(x0, w):
        for y in range(h):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            mx = max(r, g, b)
            lum = (r + g + b) / 3.0
            if a < 12:
                px[x, y] = (0, 0, 0, 0)
            elif mx < 42 and a < 235:
                px[x, y] = (0, 0, 0, 0)
            elif lum < 55 and a < 100:
                px[x, y] = (0, 0, 0, 0)
    return rgba


def center_opaque_content(im: Image.Image) -> Image.Image:
    """Translate image so its non-transparent bbox is centered on the canvas."""
    rgba = im.convert("RGBA")
    w, h = rgba.size
    px = rgba.load()

    min_x = None
    min_y = None
    max_x = None
    max_y = None

    for y in range(h):
        for x in range(w):
            if px[x, y][3] == 0:
                continue
            if min_x is None or x < min_x:
                min_x = x
            if min_y is None or y < min_y:
                min_y = y
            if max_x is None or x > max_x:
                max_x = x
            if max_y is None or y > max_y:
                max_y = y

    if min_x is None or min_y is None or max_x is None or max_y is None:
        return rgba

    # bbox in pixel coordinates (inclusive max), center as float
    bbox_cx = (min_x + (max_x + 1)) / 2.0
    bbox_cy = (min_y + (max_y + 1)) / 2.0
    canvas_cx = w / 2.0
    canvas_cy = h / 2.0

    dx = int(round(canvas_cx - bbox_cx))
    dy = int(round(canvas_cy - bbox_cy))

    if dx == 0 and dy == 0:
        return rgba

    out = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    out.alpha_composite(rgba, (dx, dy))
    return out


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    icons_dir = root / "apps/web/public/icons"
    cleaned: list[Image.Image] = []
    for name in ("icon-16.png", "icon-32.png", "icon-48.png"):
        p = icons_dir / name
        im = Image.open(p)
        out = center_opaque_content(clean_right_edge_speckles(im))
        out.save(p, format="PNG")
        cleaned.append(out)

    im16, im32, im48 = cleaned
    fav = root / "apps/web/public/favicon.ico"
    # Pillow matches each requested size to an image in [im] + append_images (exact WxH).
    im48.save(
        fav,
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
        append_images=[im16, im32],
    )


if __name__ == "__main__":
    main()
