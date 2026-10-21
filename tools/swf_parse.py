#!/usr/bin/env python3
"""Minimal SWF parser used to recover sprite bounds and anchor points.

The art in the original game is Flash vector art, so to place it in a modern
renderer we need to know where each sprite's own origin (0, 0 in Flash) sits
inside the exported PNG. That information is not in the PNG, so we recover it
by walking the SWF and computing the content bounds of every character.

SWF bit-packing notes (these tripped me up, so they are spelled out):
  - A tag header is a UI16 where the tag CODE is in the HIGH 6 bits and the
    length in the LOW 10 bits.
  - RECT, MATRIX and CXFORM are packed most-significant-bit first, which is
    the opposite of almost every other SWF field.

Usage:
    python3 tools/swf_parse.py <file.swf> > swf.json
"""

from __future__ import annotations

import json
import struct
import sys
from typing import Any

# Tag codes we care about.
DEFINE_SHAPE = 2
DEFINE_BITS = 6
DEFINE_BUTTON = 7
DEFINE_TEXT = 11
DEFINE_MORPH = 46
DEFINE_SPRITE = 39
DEFINE_BITS_LOSSLESS = 20
DEFINE_BITS_LOSSLESS2 = 36
DEFINE_BITS_JPEG2 = 21
DEFINE_BITS_JPEG3 = 35
DEFINE_TEXT2 = 33
DEFINE_EDITTEXT = 37
DEFINE_BUTTON2 = 34
DEFINE_FONT2 = 48
DEFINE_SHAPE2 = 22
DEFINE_SHAPE3 = 32
DEFINE_SHAPE4 = 83
PLACE_OBJECT = 4
PLACE_OBJECT2 = 26
PLACE_OBJECT3 = 70
FRAME_LABEL = 43
SHOW_FRAME = 1
END = 0

SHAPE_TAGS = (DEFINE_SHAPE, DEFINE_SHAPE2, DEFINE_SHAPE3, DEFINE_SHAPE4)


class Bits:
    """MSB-first bit reader (the SWF convention for RECT/MATRIX/CXFORM)."""

    def __init__(self, data: bytes, pos: int = 0) -> None:
        self.d = data
        self.bit = pos * 8

    def ub(self, n: int) -> int:
        v = 0
        for _ in range(n):
            byte = self.d[self.bit >> 3]
            v = (v << 1) | ((byte >> (7 - (self.bit & 7))) & 1)
            self.bit += 1
        return v

    def sb(self, n: int) -> int:
        v = self.ub(n)
        if n and (v >> (n - 1)) & 1:
            v -= 1 << n
        return v

    def align(self) -> None:
        self.bit = (self.bit + 7) & ~7

    @property
    def pos(self) -> int:
        return self.bit >> 3


def read_rect(b: Bits) -> tuple[float, float, float, float]:
    nbits = b.ub(5)
    if nbits == 0:
        return (0.0, 0.0, 0.0, 0.0)
    xmin = b.sb(nbits)
    xmax = b.sb(nbits)
    ymin = b.sb(nbits)
    ymax = b.sb(nbits)
    return (xmin, xmax, ymin, ymax)


def read_matrix(b: Bits) -> dict[str, Any]:
    m: dict[str, Any] = {"scaleX": 1.0, "scaleY": 1.0, "rotate": 0.0, "tx": 0.0, "ty": 0.0}
    if b.ub(1):
        n = b.ub(5)
        fb = b.ub(5)
        m["scaleX"] = b.sb(n) / (1 << fb)
        m["scaleY"] = b.sb(n) / (1 << fb)
    if b.ub(1):
        n = b.ub(5)
        m["rotate"] = b.sb(n) / (1 << 16)
    if b.ub(1):
        n = b.ub(5)
        fb = b.ub(5)
        m["tx"] = b.sb(n) / (1 << fb)
        m["ty"] = b.sb(n) / (1 << fb)
    b.align()
    return m


def read_cxform(b: Bits) -> None:
    """Skip a colour transform. It is variable length, so it must be parsed."""
    has_add = b.ub(1)
    has_mult = b.ub(1)
    nbits = b.ub(4)
    if has_add:
        b.bit += 4 * nbits
    if has_mult:
        b.bit += 4 * nbits
    if has_add:
        b.bit += nbits
    if has_mult:
        b.bit += nbits
    b.align()


def read_clip_actions(body: bytes, p: int) -> int:
    """Skip a list of clip action records, returning the new offset."""
    p += 2  # Reserved
    p += 4  # AllEventFlags
    while p + 2 <= len(body):
        flags = struct.unpack_from("<H", body, p)[0]
        p += 2
        if flags & 0x0004:  # ClipActionsNewAction
            p += 4  # EventFlags
            if p + 4 > len(body):
                break
            size = struct.unpack_from("<I", body, p)[0]
            p += 4 + size
        if flags & 0x0010:  # ClipActionsLastRecord
            break
    return p


def transform_bounds(
    bounds: tuple[float, float, float, float], m: dict[str, Any]
) -> tuple[float, float, float, float]:
    xmin, xmax, ymin, ymax = bounds
    import math

    a = m["scaleX"]
    bb = m["scaleY"]
    r = m["rotate"] * math.pi / 180.0
    cos_r, sin_r = math.cos(r), math.sin(r)
    pts = []
    for x, y in ((xmin, ymin), (xmax, ymin), (xmax, ymax), (xmin, ymax)):
        sx = x * a
        sy = y * bb
        pts.append((sx * cos_r - sy * sin_r + m["tx"], sx * sin_r + sy * cos_r + m["ty"]))
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    return (min(xs), max(xs), min(ys), max(ys))


def union(a, b):
    if a is None:
        return b
    if b is None:
        return a
    return (min(a[0], b[0]), max(a[1], b[1]), min(a[2], b[2]), max(a[3], b[3]))


def parse_tags(data: bytes, start: int, end: int):
    """Yield (code, tag_data_offset, tag_length)."""
    i = start
    while i < end:
        if i + 2 > end:
            return
        t = struct.unpack_from("<H", data, i)[0]
        code = t >> 6
        length = t & 0x3F
        i += 2
        if length == 0x3F:
            if i + 4 > end:
                return
            length = struct.unpack_from("<I", data, i)[0]
            i += 4
        body = i
        yield code, body, length
        i += length
        if code == END:
            return


def read_string(data: bytes, off: int) -> tuple[str, int]:
    e = data.index(b"\0", off)
    return data[off:e].decode("utf-8", "replace"), e + 1


class Parser:
    def __init__(self, data: bytes) -> None:
        self.d = data
        self.shapes: dict[int, tuple[float, float, float, float]] = {}
        self.sprites: dict[int, dict[str, Any]] = {}
        self.bitmaps: dict[int, tuple[float, float]] = {}

    def parse(self, start: int) -> None:
        data = self.d
        errors = 0
        for code, off, length in parse_tags(data, start, len(data)):
            body = data[off:off + length]
            try:
                self.handle(code, off, body, length)
            except Exception as exc:  # pragma: no cover - diagnostics only
                if code == DEFINE_SPRITE:
                    errors += 1
                    if errors <= 3:
                        print(f"sprite {off}: {exc!r}", file=sys.stderr)
        if errors:
            print(f"{errors} sprite(s) failed to parse", file=sys.stderr)

    def handle(self, code: int, off: int, body: bytes, length: int) -> None:
        d = self.d
        if code in SHAPE_TAGS:
            cid = struct.unpack_from("<H", body, 0)[0]
            b = Bits(body, 2)
            self.shapes[cid] = read_rect(b)
        elif code == DEFINE_MORPH:
            cid = struct.unpack_from("<H", body, 0)[0]
            b = Bits(body, 2)
            s = read_rect(b)
            e = read_rect(b)
            self.shapes[cid] = union(s, e)
        elif code in (DEFINE_TEXT, DEFINE_TEXT2):
            cid = struct.unpack_from("<H", body, 0)[0]
            b = Bits(body, 2)
            self.shapes[cid] = read_rect(b)
        elif code == DEFINE_EDITTEXT:
            cid = struct.unpack_from("<H", body, 0)[0]
            b = Bits(body, 2)
            self.shapes[cid] = read_rect(b)
        elif code == DEFINE_BITS:
            cid = struct.unpack_from("<H", body, 0)[0]
            w, h = struct.unpack_from("<HH", body, 2)
            self.bitmaps[cid] = (float(w), float(h))
        elif code == DEFINE_BITS_LOSSLESS2:
            cid = struct.unpack_from("<H", body, 0)[0]
            w, h = struct.unpack_from("<HH", body, 2)
            self.bitmaps[cid] = (float(w), float(h))
        elif code == DEFINE_BITS_LOSSLESS:
            cid = struct.unpack_from("<H", body, 0)[0]
            w, h = struct.unpack_from("<HH", body, 2)
            self.bitmaps[cid] = (float(w), float(h))
        elif code in (DEFINE_BITS_JPEG2, DEFINE_BITS_JPEG3):
            cid = struct.unpack_from("<H", body, 0)[0]
            self.bitmaps[cid] = (0.0, 0.0)
        elif code == DEFINE_SPRITE:
            cid, frames = struct.unpack_from("<HH", body, 0)
            bounds, labels = self.sprite_info(off + 4, off + length)
            self.sprites[cid] = {"frames": frames, "bounds": bounds, "labels": labels}

    def sprite_info(self, start: int, end: int):
        """Walk a sprite's children: its content bounds and its frame labels.

        A FrameLabel tag names the frame that follows it, which is how the
        original addresses its animations (`walk_front`, `_build` and so on).
        """
        d = self.d
        bounds = None
        labels: dict[str, int] = {}
        frame = 0
        for code, off, length in parse_tags(d, start, end):
            body = d[off:off + length]
            if code == FRAME_LABEL:
                name, _ = read_string(body, 0)
                if name and name not in labels:
                    labels[name] = frame + 1
            elif code == SHOW_FRAME:
                frame += 1
            try:
                if code == PLACE_OBJECT:
                    cid = struct.unpack_from("<H", body, 0)[0]
                    m = read_matrix(Bits(body, 4))
                    b = self.bounds_of(cid)
                    if b:
                        bounds = union(bounds, transform_bounds(b, m))
                elif code == PLACE_OBJECT2:
                    # PlaceObject2: flags, depth, then the optional fields,
                    # and the character id last.
                    flags = body[0]
                    p = 3
                    if flags & 0x80:  # HasClipActions
                        p = read_clip_actions(body, p)
                    if flags & 0x40:  # HasClipDepth
                        p += 2
                    if flags & 0x20:  # HasName
                        _, p = read_string(body, p)
                    if flags & 0x10:  # HasRatio
                        p += 2
                    if flags & 0x08:  # HasColorTransform
                        read_cxform(Bits(body, p))
                        p = Bits(body, p).pos
                    m = {"scaleX": 1.0, "scaleY": 1.0, "rotate": 0.0, "tx": 0.0, "ty": 0.0}
                    if flags & 0x04:  # HasMatrix
                        m = read_matrix(Bits(body, p))
                        p = Bits(body, p).pos
                    target = 0
                    if flags & 0x02:  # HasCharacter
                        target = struct.unpack_from("<H", body, p)[0]
                        p += 2
                    b = self.bounds_of(target)
                    if b:
                        bounds = union(bounds, transform_bounds(b, m))
                elif code == PLACE_OBJECT3:
                    cid = struct.unpack_from("<H", body, 0)[0]
                    flags = body[2]
                    p = 6
                    target = cid
                    if flags & 0x02:  # HasCharacter
                        target = struct.unpack_from("<H", body, p)[0]
                        p += 2
                    if flags & 0x01:  # HasMove
                        p += 2
                    if flags & 0x10:  # HasRatio
                        p += 2
                    if flags & 0x08:  # HasColorTransform
                        read_cxform(Bits(body, p))
                        p = Bits(body, p).pos
                    m = {"scaleX": 1.0, "scaleY": 1.0, "rotate": 0.0, "tx": 0.0, "ty": 0.0}
                    if flags & 0x04:  # HasMatrix
                        m = read_matrix(Bits(body, p))
                        p = Bits(body, p).pos
                    if flags & 0x40:  # HasClipDepth
                        p += 2
                    if flags & 0x20:  # HasName
                        _, p = read_string(body, p)
                    if flags & 0x80:  # HasClipActions
                        p = read_clip_actions(body, p)
                    b = self.bounds_of(target)
                    if b:
                        bounds = union(bounds, transform_bounds(b, m))
            except Exception:
                continue
        return bounds, labels

    def bounds_of(self, cid: int):
        if cid in self.shapes:
            return self.shapes[cid]
        if cid in self.bitmaps:
            w, h = self.bitmaps[cid]
            return (0.0, w, 0.0, h)
        if cid in self.sprites:
            return self.sprites[cid]["bounds"]
        return None


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__, file=sys.stderr)
        return 2
    data = open(sys.argv[1], "rb").read()
    # A compressed SWF stores its body as zlib; the header stays as it is.
    if data[:3] == b"CWS":
        import zlib

        data = data[:8] + zlib.decompress(data[8:])
    p = Parser(data)

    # Skip the header: signature + length, then the stage RECT, then the
    # frame rate and frame count, all before the first tag.
    b = Bits(data, 8)
    read_rect(b)
    b.align()
    tag_start = b.pos + 4
    p.parse(tag_start)
    out = {
        "shapes": {str(k): list(v) for k, v in p.shapes.items()},
        "bitmaps": {str(k): list(v) for k, v in p.bitmaps.items()},
        "sprites": {
            str(k): {
                "frames": v["frames"],
                "bounds": list(v["bounds"]) if v["bounds"] else None,
                "labels": v.get("labels", {}),
            }
            for k, v in p.sprites.items()
        },
    }
    json.dump(out, sys.stdout, indent=1)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
