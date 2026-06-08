#!/usr/bin/env python3
"""Generate PNG favicons from the mushaf icon design."""

from __future__ import annotations

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"

GREEN = (31, 107, 82)
GREEN_LIGHT = (230, 242, 236)
GOLD = (154, 132, 85)
GOLD_SOFT = (201, 184, 138)
WHITE = (255, 255, 255)


def draw_icon(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    pad = size * 0.06
    r = size * 0.22

    # Rounded background
    draw.rounded_rectangle((pad, pad, size - pad, size - pad), radius=r, fill=GREEN_LIGHT + (255,))
    draw.rounded_rectangle(
        (pad + 1, pad + 1, size - pad - 1, size - pad - 1),
        radius=r - 1,
        outline=GREEN + (45,),
        width=max(1, size // 32),
    )

    cx = size / 2
    top = size * 0.22
    bottom = size * 0.78
    spine = max(1, int(size * 0.04))

    # Left page
    lx0, lx1 = size * 0.18, cx - spine / 2
    draw.rounded_rectangle((lx0, top, lx1, bottom), radius=size * 0.03, fill=WHITE + (255,))
    draw.rounded_rectangle((lx0, top, lx1, bottom), radius=size * 0.03, outline=GREEN + (255,), width=max(1, size // 28))

    # Right page
    rx0, rx1 = cx + spine / 2, size * 0.82
    draw.rounded_rectangle((rx0, top, rx1, bottom), radius=size * 0.03, fill=WHITE + (255,))
    draw.rounded_rectangle((rx0, top, rx1, bottom), radius=size * 0.03, outline=GREEN + (255,), width=max(1, size // 28))

    # Spine
    draw.line((cx, size * 0.2, cx, size * 0.8), fill=GOLD + (255,), width=spine)

    # Page lines
    lw = max(1, size // 40)
    for y in (0.36, 0.46, 0.56):
        yy = size * y
        draw.line((lx0 + size * 0.06, yy, lx1 - size * 0.05, yy), fill=GREEN + (70,), width=lw)
        draw.line((rx0 + size * 0.05, yy, rx1 - size * 0.06, yy), fill=GREEN + (70,), width=lw)

    # Star medallion
    star_r = size * 0.09
    draw.ellipse((cx - star_r, size * 0.44 - star_r, cx + star_r, size * 0.44 + star_r), fill=GOLD_SOFT + (170,))
    # Simple 4-point star
    pts = []
    for i in range(8):
        angle = i * 3.14159 / 4 - 3.14159 / 2
        rad = star_r * (0.45 if i % 2 else 1.0)
        pts.append((cx + rad * __import__("math").cos(angle), size * 0.44 + rad * __import__("math").sin(angle)))
    draw.polygon(pts, fill=GREEN + (190,))

    return img


def main() -> int:
    sizes = {
        "favicon-32.png": 32,
        "favicon-16.png": 16,
        "apple-touch-icon.png": 180,
        "icon-192.png": 192,
        "icon-512.png": 512,
    }
    for name, size in sizes.items():
        path = DOCS / name
        draw_icon(size).save(path, format="PNG", optimize=True)
        print(f"Wrote {path.name} ({size}px)")

    # Multi-size ICO for legacy browsers
    ico_path = DOCS / "favicon.ico"
    imgs = [draw_icon(s) for s in (16, 32, 48)]
    imgs[0].save(ico_path, format="ICO", sizes=[(s, s) for s in (16, 32, 48)])
    print(f"Wrote {ico_path.name}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
