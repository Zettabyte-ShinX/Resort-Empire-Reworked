#!/usr/bin/env python3
"""Generate the source app icon (1024x1024 PNG) for the Tauri bundle.

Pure stdlib PNG writer - no image libraries required. Draws a simple
isometric resort tile with a palm tree, matching the game's palette.
"""

from __future__ import annotations

import struct
import sys
import zlib

SIZE = 1024
BG = (24, 32, 42)


def lerp(a: int, b: int, t: float) -> int:
    return int(a + (b - a) * t)


def mix(c1, c2, t):
    return tuple(lerp(c1[i], c2[i], t) for i in range(3))


def main() -> None:
    out = sys.argv[1] if len(sys.argv) > 1 else "icon.png"

    # Background with a vertical gradient.
    px = [[mix(BG, (18, 26, 34), y / SIZE) for _ in range(SIZE)] for y in range(SIZE)]

    def put(x, y, c, a=1.0):
        if 0 <= x < SIZE and 0 <= y < SIZE:
            if a >= 1.0:
                px[y][x] = c
            else:
                px[y][x] = mix(px[y][x], c, a)

    # Isometric ground diamond.
    cx, cy, rx, ry = SIZE / 2, SIZE * 0.60, SIZE * 0.36, SIZE * 0.19
    for y in range(SIZE):
        for x in range(SIZE):
            # |dx/rx| + |dy/ry| <= 1
            if abs(x - cx) / rx + abs(y - cy) / ry <= 1.0:
                t = (y - (cy - ry)) / (2 * ry)
                put(x, y, mix((96, 150, 110), (62, 108, 78), t))

    # A small cottage: front wall, side wall and gable roof.
    bw = SIZE * 0.13
    bh = SIZE * 0.20
    rh = SIZE * 0.11
    bx, by = cx + SIZE * 0.02, cy - SIZE * 0.02
    depth_x = SIZE * 0.075
    depth_y = SIZE * 0.045
    roof = (198, 88, 62)
    roof_dark = (146, 58, 40)
    wall_l = (226, 219, 203)
    wall_r = (188, 179, 162)

    # Side wall (the right-hand face, receding up and right).
    for y in range(int(bh)):
        t = y / bh
        for x in range(int(bx + bw - depth_x * t), int(bx + bw + depth_x * (1 - t))):
            put(x, int(by - bh + y - depth_y * (1 - t)), wall_r)

    # Front wall.
    for y in range(int(bh)):
        for x in range(int(bx - bw), int(bx + bw)):
            put(x, int(by - bh + y), wall_l)

    # Roof: gable triangle on the front plus a parallelogram on the side.
    for y in range(int(rh)):
        t = y / rh
        half = bw * (1 - t)
        for x in range(int(bx - half), int(bx + half)):
            put(x, int(by - bh - rh + y), mix(roof, roof_dark, t))
    for y in range(int(rh)):
        t = y / rh
        for x in range(int(bx + bw * (1 - t)), int(bx + bw * (1 - t) + depth_x * (1 - t * 0.6))):
            put(x, int(by - bh - rh + y - depth_y * (1 - t)), roof_dark)

    # Door and a window.
    dw = SIZE * 0.035
    for y in range(int(bh * 0.55)):
        for x in range(int(bx - dw), int(bx + dw)):
            put(x, int(by - bh * 0.55 + y), (92, 68, 52))
    ww = SIZE * 0.028
    for y in range(int(ww)):
        for x in range(int(bx - bw * 0.62 - ww), int(bx - bw * 0.62 + ww)):
            put(x, int(by - bh * 0.78 + y), (126, 178, 205))

    # Palm tree: trunk + fronds.
    tx, ty = cx - SIZE * 0.16, cy - SIZE * 0.02
    trunk_h = SIZE * 0.20
    for y in range(int(trunk_h)):
        t = y / trunk_h
        w = lerp(SIZE * 0.016, SIZE * 0.010, t)
        for x in range(int(tx - w), int(tx + w)):
            put(x, int(ty - y), (138, 106, 63))
    for i in range(7):
        import math

        a = math.pi * 0.15 + (i / 6) * math.pi * 0.85
        length = SIZE * (0.10 if i not in (0, 6) else 0.075)
        for s in range(0, 100):
            f = s / 100
            px_ = tx + math.cos(a) * length * f
            py_ = ty - trunk_h - math.sin(a) * length * f + f * f * SIZE * 0.03
            for dx in range(-4, 5):
                put(int(px_) + dx, int(py_), (63, 138, 74))

    # Soft vignette so the icon reads well at small sizes.
    raw = bytearray()
    for y in range(SIZE):
        raw.append(0)
        for x in range(SIZE):
            c = px[y][x]
            raw.extend(bytes(c))

    def chunk(tag: bytes, data: bytes) -> bytes:
        c = struct.pack(">I", len(data)) + tag + data
        return c + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", SIZE, SIZE, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(raw), 9))
    png += chunk(b"IEND", b"")

    with open(out, "wb") as f:
        f.write(png)
    print(f"wrote {out} ({len(png)} bytes)")


if __name__ == "__main__":
    main()
