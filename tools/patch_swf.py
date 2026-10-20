#!/usr/bin/env python3
"""
Rewrite a SWF with some of a clip's children left out.

The original game hides a clip's `ground` child before it captures the
frames, and keeps only the floor itself. The extractor cannot know that, so
it renders every child. This tool drops the named characters from a clip so
the frames can be captured the way the game shows them.

Usage:
    python3 tools/patch_swf.py <in.swf> <out.swf> <clipId> <charId> [charId ...]
"""

from __future__ import annotations

import struct
import sys

DEFINE_SPRITE = 39
PLACE_OBJECT = 4
PLACE_OBJECT2 = 26
PLACE_OBJECT3 = 70


def read_tag_header(data: bytes, pos: int) -> tuple[int, int, int]:
    """Return (code, length, header size) of the tag at pos.

    The header is a UI16 with the tag code in the top ten bits and the
    length in the bottom six. A length of 0x3F means the real length is a
    UI32 that follows.
    """
    head = int.from_bytes(data[pos:pos + 2], "little")
    code = head >> 6
    length = head & 0x3F
    if length == 0x3F:
        return code, int.from_bytes(data[pos + 2:pos + 6], "little"), 6
    return code, length, 2


def place_object_char(data: bytes, body: bytes, code: int) -> int | None:
    """The character a PlaceObject tag places, if any."""
    if code == PLACE_OBJECT:
        return struct.unpack_from("<H", body, 0)[0]
    if code == PLACE_OBJECT2:
        flags = struct.unpack_from("<H", body, 0)[0]
        if not (flags & 0x40):
            return None
        return struct.unpack_from("<H", body, 4)[0]
    if code == PLACE_OBJECT3:
        flags = struct.unpack_from("<H", body, 0)[0]
        if not (flags & 0x40):
            return None
        # PlaceObject3: flags, depth, then the optional class name, then the
        # character id.
        off = 4
        if flags & 0x04:
            off += 2 + body[off]
        return struct.unpack_from("<H", body, off)[0]
    return None


def write_tag(out: bytearray, code: int, body: bytes) -> None:
    """Write a tag, using the long form when the length needs it."""
    if len(body) < 0x3F:
        out += ((code << 6) | len(body)).to_bytes(2, "little")
    else:
        out += ((code << 6) | 0x3F).to_bytes(2, "little")
        out += struct.pack("<I", len(body))
    out += body


def patch(data: bytes, clip_id: int, drop: set[int]) -> bytes:
    """Return the SWF with the characters removed from the clip."""
    out = bytearray()
    # The header, the stage rectangle, the frame rate and the frame count.
    pos = 8
    # The stage rectangle: five bits of count, then four fields.
    nbits = (data[pos] >> 3) & 0x1F
    pos += (5 + 4 * nbits + 7) // 8
    pos += 4  # the frame rate and the frame count
    out += data[:pos]

    while pos < len(data):
        code, length, hsize = read_tag_header(data, pos)
        body = data[pos + hsize:pos + hsize + length]
        if code == 0:
            out += data[pos:pos + hsize]
            break
        if code == DEFINE_SPRITE and struct.unpack_from("<H", body, 0)[0] == clip_id:
            body = patch_sprite(body, drop)
            length = len(body)
        write_tag(out, code, body)
        pos += hsize + length
    return bytes(out)


def patch_sprite(body: bytes, drop: set[int]) -> bytes:
    """Remove the place-object tags for the dropped characters."""
    frames = struct.unpack_from("<H", body, 0)[0]
    out = bytearray(body[:2])
    pos = 2
    for _ in range(frames):
        while pos < len(body):
            code, length, hsize = read_tag_header(body, pos)
            if pos + hsize + length > len(body):
                break
            tag = body[pos + hsize:pos + hsize + length]
            if code in (PLACE_OBJECT, PLACE_OBJECT2, PLACE_OBJECT3):
                cid = place_object_char(body, tag, code)
                if cid is not None and cid in drop:
                    pos += hsize + length
                    continue
            out += body[pos:pos + hsize + length]
            pos += hsize + length
            if code == 1:  # ShowFrame
                break
        else:
            break
    return bytes(out)


def main() -> int:
    if len(sys.argv) < 5:
        print(__doc__, file=sys.stderr)
        return 2
    src, dst, clip = sys.argv[1], sys.argv[2], int(sys.argv[3])
    drop = {int(c) for c in sys.argv[4:]}
    data = open(src, "rb").read()
    out = patch(data, clip, drop)
    # The header carries the uncompressed length of the file.
    if out[:3] == b"FWS":
        out = out[:4] + struct.pack("<I", len(out)) + out[8:]
    open(dst, "wb").write(out)
    print(f"wrote {dst}: {len(out)} bytes (was {len(data)}), dropped {sorted(drop)} from clip {clip}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
