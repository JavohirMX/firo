#!/usr/bin/env python3
"""Generate Firo's icon set.

## Why this script exists

Upstream shipped pre-rendered PNGs of the Excalidraw logo. Phase 0 removes the
Excalidraw brand, and the replacement had to come from somewhere. Firo has no
designed identity yet — the product name is still a working name and no palette
has been chosen (see docs/roadmap.md) — so this script renders a deliberately
neutral placeholder rather than inventing a brand.

That makes the icons *reproducible and reviewable*: the geometry is three
numbers and two colours, visible in the diff, instead of ten opaque binaries
with no provenance. When a real mark is designed, edit `MARK` below and re-run
this script.

## Usage

    python3 scripts/brand/generate-icons.py

Requires only the Python standard library. `resvg`, `sharp` and Inkscape were
all unavailable in the dev environment, so this rasterises simple geometry
directly (signed-distance fields, 4x supersampled) rather than shelling out.

## Output

    public/favicon.svg
    public/favicon-{16,32,48}x{16,32}.png
    public/favicon.ico
    public/apple-touch-icon.png
    public/android-chrome-{192,512}x{192,512}.png
    public/maskable_icon_x{192,512}.png
    public/og-image.png
"""

from __future__ import annotations

import math
import os
import struct
import zlib

# ---------------------------------------------------------------------------
# Mark definition
# ---------------------------------------------------------------------------

# A whiteboard: a rounded frame with two strokes inside. Neutral on purpose —
# this is a placeholder, not a designed identity.
INK = (0x1B, 0x1B, 0x1F)  # near-black, matches the editor's dark canvas
CHALK = (0xFF, 0xFF, 0xFF)

# Stroke weights as a fraction of the icon's edge length, so every raster size
# is the same drawing scaled.
FRAME_INSET = 0.085  # frame rectangle inset from the edge
FRAME_WEIGHT = 0.062  # frame stroke weight
# The stroke block is centred on the tile: it spans 0.355..0.645, so its own
# midpoint is the tile's midpoint rather than sitting to the left of it.
STROKE_A = ((0.355, 0.365), (0.535, 0.365))  # horizontal chalk line
STROKE_B = ((0.355, 0.635), (0.645, 0.635))  # longer chalk line
STROKE_C = ((0.355, 0.365), (0.355, 0.635))  # connector, makes it read as a diagram
STROKE_WEIGHT = 0.058


def rounded_rect_sdf(x: float, y: float, cx: float, cy: float, hw: float, hh: float, r: float) -> float:
    """Signed distance to a rounded rectangle. Negative inside."""
    qx = abs(x - cx) - (hw - r)
    qy = abs(y - cy) - (hh - r)
    ax, ay = max(qx, 0.0), max(qy, 0.0)
    return math.hypot(ax, ay) + min(max(qx, qy), 0.0) - r


def segment_sdf(x: float, y: float, a: tuple[float, float], b: tuple[float, float]) -> float:
    """Signed distance to a line segment."""
    px, py = x - a[0], y - a[1]
    bx, by = b[0] - a[0], b[1] - a[1]
    denom = bx * bx + by * by
    t = 0.0 if denom == 0 else max(0.0, min(1.0, (px * bx + py * by) / denom))
    return math.hypot(px - bx * t, py - by * t)


def coverage(size: int, samples: int = 4) -> list[list[tuple[int, int, int, int]]]:
    """Rasterise the mark at `size`x`size`, returning rows of RGBA tuples.

    Layering, front to back: the chalk strokes sit on top of an ink tile, and
    everything outside the tile is transparent so the browser can composite the
    icon on light and dark chrome alike. A solid tile rather than an outline is
    deliberate — at 16 px an outline disappears.

    Four samples per axis. The shapes are flat-filled and axis-aligned, so
    supersampling is more than enough — there are no curves in the geometry
    that need a proper analytic integral.
    """
    frame_half = 0.5 - FRAME_INSET
    corner = frame_half * 0.42
    half_stroke = STROKE_WEIGHT / 2
    step = 1.0 / samples
    offset = step / 2

    rows: list[list[tuple[int, int, int, int]]] = []
    for py in range(size):
        row: list[tuple[int, int, int, int]] = []
        for px in range(size):
            inside = 0
            chalk_hits = 0
            for sy in range(samples):
                y = (py + offset + sy * step) / size
                for sx in range(samples):
                    x = (px + offset + sx * step) / size

                    if rounded_rect_sdf(x, y, 0.5, 0.5, frame_half, frame_half, corner) > 0:
                        continue
                    inside += 1

                    if (
                        segment_sdf(x, y, STROKE_A[0], STROKE_A[1]) <= half_stroke
                        or segment_sdf(x, y, STROKE_B[0], STROKE_B[1]) <= half_stroke
                        or segment_sdf(x, y, STROKE_C[0], STROKE_C[1]) <= half_stroke
                    ):
                        chalk_hits += 1

            if not inside:
                row.append((0, 0, 0, 0))
            elif not chalk_hits:
                row.append((INK[0], INK[1], INK[2], 255))
            else:
                # blend chalk over ink by chalk coverage
                t = chalk_hits / inside
                r = round(INK[0] + (CHALK[0] - INK[0]) * t)
                g = round(INK[1] + (CHALK[1] - INK[1]) * t)
                b = round(INK[2] + (CHALK[2] - INK[2]) * t)
                row.append((r, g, b, 255))
        rows.append(row)
    return rows


# ---------------------------------------------------------------------------
# PNG / ICO encoding
# ---------------------------------------------------------------------------


def encode_png(pixels: list[list[tuple[int, int, int, int]]]) -> bytes:
    height = len(pixels)
    width = len(pixels[0])
    raw = bytearray()
    for row in pixels:
        raw.append(0)  # filter type 0 (None)
        for r, g, b, a in row:
            raw += bytes((r, g, b, a))

    def chunk(tag: bytes, data: bytes) -> bytes:
        return (
            struct.pack(">I", len(data))
            + tag
            + data
            + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)
        )

    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)  # 8-bit RGBA
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", ihdr)
        + chunk(b"IDAT", zlib.compress(bytes(raw), 9))
        + chunk(b"IEND", b"")
    )


def encode_ico(entries: list[tuple[int, bytes]]) -> bytes:
    """ICO container holding PNG-encoded images (Vista+ format, universally supported)."""
    count = len(entries)
    header = struct.pack("<HHH", 0, 1, count)
    offset = 6 + 16 * count
    directory = b""
    blobs = b""
    for size, png in entries:
        directory += struct.pack(
            "<BBBBHHII",
            size if size < 256 else 0,
            size if size < 256 else 0,
            0,  # palette size
            0,  # reserved
            1,  # colour planes
            32,  # bits per pixel
            len(png),
            offset,
        )
        blobs += png
        offset += len(png)
    return header + directory + blobs


def scale(pixels: list[list[tuple[int, int, int, int]]], size: int) -> list[list[tuple[int, int, int, int]]]:
    """Nearest-neighbour upscale. Only used for the OG card background."""
    src = len(pixels)
    out = []
    for y in range(size):
        sy = min(src - 1, y * src // size)
        row = pixels[sy]
        out.append([row[min(src - 1, x * src // size)] for x in range(size)])
    return out


# ---------------------------------------------------------------------------
# SVG (vector source, hand-written to match the raster above)
# ---------------------------------------------------------------------------


def build_svg(edge: int, inset: float, stroke_weight: float, corner: float) -> str:
    e = edge
    m = inset * e
    s = stroke_weight * e
    c = corner * e

    def pt(p: tuple[float, float]) -> str:
        return f"{p[0] * e:.1f},{p[1] * e:.1f}"

    return f"""<svg xmlns="http://www.w3.org/2000/svg" width="{e}" height="{e}" viewBox="0 0 {e} {e}" role="img" aria-label="Firo">
  <!--
    Placeholder mark, generated by scripts/brand/generate-icons.py.
    A whiteboard frame with two chalk strokes and a connector. Deliberately
    neutral: Firo has no designed identity yet, so this stands in rather than
    inventing a brand. See the script's docstring.
  -->
  <rect x="{m:.1f}" y="{m:.1f}" width="{e - 2 * m:.1f}" height="{e - 2 * m:.1f}" rx="{c:.1f}" ry="{c:.1f}" fill="#{INK[0]:02X}{INK[1]:02X}{INK[2]:02X}"/>
  <g stroke="#{CHALK[0]:02X}{CHALK[1]:02X}{CHALK[2]:02X}" stroke-width="{s:.1f}" stroke-linecap="round" fill="none">
    <line x1="{STROKE_A[0][0] * e:.1f}" y1="{STROKE_A[0][1] * e:.1f}" x2="{STROKE_A[1][0] * e:.1f}" y2="{STROKE_A[1][1] * e:.1f}"/>
    <line x1="{STROKE_B[0][0] * e:.1f}" y1="{STROKE_B[0][1] * e:.1f}" x2="{STROKE_B[1][0] * e:.1f}" y2="{STROKE_B[1][1] * e:.1f}"/>
    <line x1="{STROKE_C[0][0] * e:.1f}" y1="{STROKE_C[0][1] * e:.1f}" x2="{STROKE_C[1][0] * e:.1f}" y2="{STROKE_C[1][1] * e:.1f}"/>
  </g>
</svg>
"""


def main() -> None:
    root = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
    public = os.path.normpath(os.path.join(root, "public"))
    os.makedirs(public, exist_ok=True)

    def write(name: str, data: bytes) -> None:
        path = os.path.join(public, name)
        with open(path, "wb") as fh:
            fh.write(data)
        print(f"  {name}  ({len(data):,} bytes)")

    # The frame's corner radius, shared by the raster and the SVG so they match.
    frame_half = 0.5 - FRAME_INSET - FRAME_WEIGHT / 2
    corner = frame_half * 0.42

    print("favicon.svg")
    write("favicon.svg", build_svg(1000, FRAME_INSET, STROKE_WEIGHT, corner).encode())

    cache: dict[int, list[list[tuple[int, int, int, int]]]] = {}
    for size in (16, 32, 48, 128, 180, 192, 256, 512):
        cache[size] = coverage(size)

    print("square icons")
    for name, size in [
        ("favicon-16x16.png", 16),
        ("favicon-32x32.png", 32),
        ("apple-touch-icon.png", 180),
        ("android-chrome-192x192.png", 192),
        ("android-chrome-512x512.png", 512),
    ]:
        write(name, encode_png(cache[size]))

    # Maskable icons get cropped to a shape of unknown geometry, so Android
    # requires the content to stay inside a safe zone of ~80% diameter. Render
    # the mark smaller and centre it on a transparent field.
    print("maskable icons (safe zone)")
    for name, size in [("maskable_icon_x192.png", 192), ("maskable_icon_x512.png", 512)]:
        inner = round(size * 0.8)
        pad = (size - inner) // 2
        small = coverage(inner)
        field = [[(0, 0, 0, 0)] * size for _ in range(size)]
        for y in range(inner):
            for x in range(inner):
                field[pad + y][pad + x] = small[y][x]
        write(name, encode_png(field))

    print("favicon.ico")
    ico = encode_ico([(16, encode_png(cache[16])), (32, encode_png(cache[32])), (48, encode_png(cache[48]))])
    write("favicon.ico", ico)

    print("og-image.png (1200x630)")
    # A flat ink card with the mark centred, rather than a typeset headline: any
    # wording here would be a design decision, and there is no identity to
    # design from yet. og:title / og:description carry the text.
    card_w, card_h = 1200, 630
    card = [[(INK[0], INK[1], INK[2], 255)] * card_w for _ in range(card_h)]
    mark_size = 320
    mark = coverage(mark_size)
    origin_x = card_w // 2 - mark_size // 2
    origin_y = card_h // 2 - mark_size // 2
    for y in range(mark_size):
        for x in range(mark_size):
            r, g, b, a = mark[y][x]
            if a:
                card[origin_y + y][origin_x + x] = (r, g, b, 255)
    write("og-image.png", encode_png(card))

    print("\ndone — these are placeholders pending a designed identity (docs/roadmap.md)")


if __name__ == "__main__":
    main()
