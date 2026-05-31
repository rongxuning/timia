from __future__ import annotations

import os
import sys
from dataclasses import dataclass
from pathlib import Path

_SCRIPTS_DIR = Path(__file__).resolve().parent
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from clean_icon_right_edge import clean_right_edge_speckles


LAVENDER = (201, 182, 255)  # #C9B6FF
TEXT_COLOR = (17, 17, 17)  # #111111


@dataclass(frozen=True)
class Box:
    left: int
    top: int
    right: int
    bottom: int

    @property
    def width(self) -> int:
        return max(0, self.right - self.left)

    @property
    def height(self) -> int:
        return max(0, self.bottom - self.top)


def _nontransparent_bbox(img: Image.Image, *, x_max: int | None = None) -> Box | None:
    rgba = img.convert("RGBA")
    w, h = rgba.size
    x_limit = min(w, x_max) if x_max is not None else w
    pix = rgba.load()

    left = None
    top = None
    right = None
    bottom = None

    for y in range(h):
        for x in range(x_limit):
            if pix[x, y][3] > 0:
                if left is None or x < left:
                    left = x
                if top is None or y < top:
                    top = y
                if right is None or x + 1 > right:
                    right = x + 1
                if bottom is None or y + 1 > bottom:
                    bottom = y + 1

    if left is None:
        return None
    return Box(left, top, right or 0, bottom or 0)


def _mask_bbox_by_predicate(img: Image.Image, predicate) -> Box | None:
    rgba = img.convert("RGBA")
    w, h = rgba.size
    pix = rgba.load()

    left = None
    top = None
    right = None
    bottom = None

    for y in range(h):
        for x in range(w):
            r, g, b, a = pix[x, y]
            if a == 0:
                continue
            if not predicate(r, g, b, a):
                continue
            if left is None or x < left:
                left = x
            if top is None or y < top:
                top = y
            if right is None or x + 1 > right:
                right = x + 1
            if bottom is None or y + 1 > bottom:
                bottom = y + 1

    if left is None:
        return None
    return Box(left, top, right or 0, bottom or 0)


def _is_orange_like(r: int, g: int, b: int, a: int) -> bool:
    # Tuned for the reference (bright orange mark) while excluding dark text.
    return a > 0 and r > 180 and g < 170 and b < 140


def _recolor_icon(src: Image.Image, icon_box: Box) -> Image.Image:
    rgba = src.convert("RGBA")
    out = Image.new("RGBA", rgba.size, (0, 0, 0, 0))
    out.paste(rgba, (0, 0))
    pix = out.load()
    for y in range(icon_box.top, icon_box.bottom):
        for x in range(icon_box.left, icon_box.right):
            r, g, b, a = pix[x, y]
            if a == 0:
                continue
            if _is_orange_like(r, g, b, a):
                pix[x, y] = (LAVENDER[0], LAVENDER[1], LAVENDER[2], a)
    return out


def _pick_font(size: int) -> ImageFont.FreeTypeFont | ImageFont.ImageFont:
    candidates = [
        "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
        "/System/Library/Fonts/Supplemental/Helvetica Bold.ttf",
        "/Library/Fonts/Arial Bold.ttf",
        "/Library/Fonts/HelveticaNeue.ttf",
    ]
    for p in candidates:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size=size)
            except Exception:
                pass
    return ImageFont.load_default()


def _fit_font(draw: ImageDraw.ImageDraw, text: str, target_h: int) -> ImageFont.ImageFont:
    # Binary search a reasonable font size.
    lo, hi = 8, 220
    best = _pick_font(lo)
    while lo <= hi:
        mid = (lo + hi) // 2
        font = _pick_font(mid)
        bbox = draw.textbbox((0, 0), text, font=font)
        h = bbox[3] - bbox[1]
        if h <= target_h:
            best = font
            lo = mid + 1
        else:
            hi = mid - 1
    return best


def generate(
    *,
    reference_png: Path,
    out_wordmark_png: Path,
    out_icon_png: Path,
    out_icons_dir: Path,
    out_favicon_ico: Path,
) -> None:
    src = Image.open(reference_png).convert("RGBA")
    w, h = src.size

    # Detect icon bbox by finding the orange mark pixels.
    icon_box = _mask_bbox_by_predicate(src, _is_orange_like)
    if icon_box is None or icon_box.width < 5 or icon_box.height < 5:
        raise RuntimeError("Could not detect left icon region from reference image.")

    recolored = _recolor_icon(src, icon_box)

    # Build wordmark: reuse icon placement + draw "Timia".
    wordmark = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    wordmark.paste(recolored.crop((icon_box.left, icon_box.top, icon_box.right, icon_box.bottom)), (icon_box.left, icon_box.top))
    draw = ImageDraw.Draw(wordmark)

    text = "Timia"
    target_text_h = int(h * 0.62)
    font = _fit_font(draw, text, target_text_h)
    tb = draw.textbbox((0, 0), text, font=font)
    tw, th = (tb[2] - tb[0], tb[3] - tb[1])

    padding = max(10, int(w * 0.03))
    x = icon_box.right + padding
    y = int((h - th) / 2) - tb[1]
    draw.text((x, y), text, font=font, fill=TEXT_COLOR)

    out_wordmark_png.parent.mkdir(parents=True, exist_ok=True)
    wordmark.save(out_wordmark_png, format="PNG")

    # Icon-only square asset from the recolored icon area.
    pad = max(6, int(min(icon_box.width, icon_box.height) * 0.18))
    crop = recolored.crop(
        (
            max(0, icon_box.left - pad),
            max(0, icon_box.top - pad),
            min(w, icon_box.right + pad),
            min(h, icon_box.bottom + pad),
        )
    )
    cw, ch = crop.size
    side = max(cw, ch)
    square = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    square.paste(crop, ((side - cw) // 2, (side - ch) // 2))

    out_icon_png.parent.mkdir(parents=True, exist_ok=True)
    square_512 = square.resize((512, 512), Image.Resampling.LANCZOS)
    square_512.save(out_icon_png, format="PNG")

    out_icons_dir.mkdir(parents=True, exist_ok=True)
    for s in (16, 32, 48):
        path_png = out_icons_dir / f"icon-{s}.png"
        square_512.resize((s, s), Image.Resampling.LANCZOS).save(path_png, format="PNG")
        im = Image.open(path_png)
        clean_right_edge_speckles(im).save(path_png, format="PNG")

    out_favicon_ico.parent.mkdir(parents=True, exist_ok=True)
    im16 = Image.open(out_icons_dir / "icon-16.png")
    im32 = Image.open(out_icons_dir / "icon-32.png")
    im48 = Image.open(out_icons_dir / "icon-48.png")
    im48.save(
        out_favicon_ico,
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
        append_images=[im16, im32],
    )


if __name__ == "__main__":
    repo_root = Path(__file__).resolve().parents[1]
    env_ref = os.environ.get("TIMIA_REFERENCE_PNG")
    if not env_ref:
        raise SystemExit(
            "Set TIMIA_REFERENCE_PNG to the source logo PNG path, e.g.\n"
            "  TIMIA_REFERENCE_PNG=/absolute/path/to/jibble-logo.png python scripts/generate_brand_assets.py"
        )
    reference = Path(env_ref)

    public_dir = repo_root / "apps/web/public"
    generate(
        reference_png=reference,
        out_wordmark_png=public_dir / "brand/timia-wordmark.png",
        out_icon_png=public_dir / "brand/timia-icon-512.png",
        out_icons_dir=public_dir / "icons",
        out_favicon_ico=public_dir / "favicon.ico",
    )
