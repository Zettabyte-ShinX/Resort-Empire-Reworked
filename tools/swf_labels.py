#!/usr/bin/env python3
"""List the frame labels of every sprite in the original's SWF.

The original names the frames of a clip: `level_2` for a facility at its
second upgrade, `walk_front` for a guest walking towards the camera, `_build`
for the plot while it is being built. The art manifest records those names
against the frames they belong to, so the game can pick the right picture
the same way the original does.

Usage:
    python3 tools/swf_labels.py <swf> <out.json>
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from swf_parse import Parser  # noqa: E402
import struct  # noqa: E402


def load_swf(path: Path) -> bytes:
    data = path.read_bytes()
    if data[:3] == b"CWS":
        import zlib

        data = data[:8] + zlib.decompress(data[8:])
    return data


def main() -> int:
    if len(sys.argv) != 3:
        print(__doc__, file=sys.stderr)
        return 2
    swf = Path(sys.argv[1])
    out = Path(sys.argv[2])
    data = load_swf(swf)
    p = Parser(data)
    # Skip the header: the signature, the length, the stage rectangle, the
    # frame rate and the frame count, all before the first tag.
    from swf_parse import Bits, read_rect  # noqa: E402

    b = Bits(data, 8)
    read_rect(b)
    b.align()
    p.parse(b.pos + 4)
    labels = {
        str(cid): sprite["labels"]
        for cid, sprite in p.sprites.items()
        if sprite.get("labels")
    }
    out.write_text(json.dumps(labels, indent=1, sort_keys=True), encoding="utf-8")
    print(f"{len(labels)} labelled sprites -> {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
