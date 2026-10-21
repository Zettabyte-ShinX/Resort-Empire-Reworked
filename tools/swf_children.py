#!/usr/bin/env python3
"""List the named children of a symbol inside the original SWF.

A facility in the original is a symbol that holds the building (`mclip_mc`),
the plot marking (`blok`) and the guests' clips. Our renderer was drawing the
guest clip as if it were the building, so this finds the character id of the
building for every facility.

Usage:
    python3 tools/swf_children.py <file.swf> <character id> [character id ...]
"""

from __future__ import annotations

import struct
import sys
import zlib
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from swf_parse import (  # noqa: E402
    Bits,
    DEFINE_SPRITE,
    PLACE_OBJECT,
    PLACE_OBJECT2,
    PLACE_OBJECT3,
    parse_tags,
    read_clip_actions,
    read_cxform,
    read_matrix,
)


def load(path: str) -> bytes:
    data = open(path, "rb").read()
    if data[:3] == b"CWS":
        data = data[:8] + zlib.decompress(data[8:])
    return data


def find_sprite(data: bytes, cid: int) -> tuple[int, int] | None:
    """The (offset, length) of a sprite's tag body."""
    b = Bits(data, 8)
    from swf_parse import read_rect

    read_rect(b)
    b.align()
    start = b.pos + 4
    for code, off, length in parse_tags(data, start, len(data)):
        if code == DEFINE_SPRITE:
            got = struct.unpack_from("<H", data, off)[0]
            if got == cid:
                return off, length
    return None


def children(data: bytes, off: int, length: int) -> list[dict]:
    """The named children placed inside a sprite."""
    out: list[dict] = []
    end = off + length
    for code, coff, clen in parse_tags(data, off + 4, end):
        body = data[coff:coff + clen]
        try:
            if code == PLACE_OBJECT:
                cid = struct.unpack_from("<H", body, 0)[0]
                b = Bits(body, 2)
                matrix = read_matrix(b)
                b.align()
                name, _ = read_string(data, b.pos)
                out.append({"name": name, "char": cid, "matrix": matrix})
            elif code == PLACE_OBJECT2:
                # PlaceObject2: flags, depth, then the optional fields, and
                # the character id last.
                flags = body[0]
                p = 3
                if flags & 0x80:  # HasClipActions
                    p = read_clip_actions(body, p)
                if flags & 0x40:  # HasClipDepth
                    p += 2
                name = ""
                if flags & 0x20:  # HasName
                    name, p = read_string(data, p)
                if flags & 0x10:  # HasRatio
                    p += 2
                if flags & 0x08:  # HasColorTransform
                    read_cxform(Bits(body, p))
                    p = Bits(body, p).pos
                matrix = read_matrix(Bits(body, p)) if flags & 0x04 else None
                if flags & 0x04:
                    p = Bits(body, p).pos
                cid = struct.unpack_from("<H", body, p)[0] if flags & 0x02 else 0
                depth = struct.unpack_from("<H", body, 1)[0]
                out.append({"name": name, "char": cid, "matrix": matrix, "depth": depth})
            elif code == PLACE_OBJECT3:
                flags = body[0]
                b = Bits(body, 1)
                b.ub(2)  # reserved
                depth = b.ub(6)
                cid = b.ub(16) if flags & 0x80 else 0
                matrix = read_matrix(b) if flags & 0x40 else None
                if flags & 0x20:
                    b.sb(16)  # colour transform alpha
                    b.sb(16)  # red
                    b.sb(16)  # green
                    b.sb(16)  # blue
                if flags & 0x10:
                    b.ub(8)  # ratio
                name = ""
                if flags & 0x08:
                    b.align()
                    name, _ = read_string(data, b.pos)
                out.append({"name": name, "char": cid, "matrix": matrix, "depth": depth})
        except Exception as exc:  # pragma: no cover - diagnostics only
            out.append({"name": f"<error {exc!r}>", "char": -1})
    return out


def read_string(data: bytes, off: int) -> tuple[str, int]:
    end = data.index(b"\x00", off)
    return data[off:end].decode("latin-1"), end + 1


def main() -> int:
    if len(sys.argv) < 3:
        print(__doc__, file=sys.stderr)
        return 2
    data = load(sys.argv[1])
    for arg in sys.argv[2:]:
        cid = int(arg)
        found = find_sprite(data, cid)
        print(f"=== character {cid} ===")
        if not found:
            print("  (not a sprite)")
            continue
        off, length = found
        for child in children(data, off, length):
            print(f"  {child['name'] or '(unnamed)':24} char {child['char']:>6}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
