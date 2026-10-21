#!/usr/bin/env python3
"""Record where each facility's room sits inside its booth.

The original draws a facility as a booth clip that holds the room clip. The
room's place in the booth is the placement of the `mclip_mc` element plus the
placement of the sprite it points at, so this reads both out of the SWF's
export and writes the result into the art manifest.

Usage: python3 tools/room_offsets.py <export-dir> <manifest>
"""

import json
import re
import sys
from pathlib import Path


def main() -> None:
    export = Path(sys.argv[1])
    manifest_path = Path(sys.argv[2])
    manifest = json.loads(manifest_path.read_text())
    rooms = manifest.get("rooms", {})
    by_chid = {entry["chid"]: name for name, entry in rooms.items()}

    offsets = {}
    for d in sorted(export.iterdir()):
        if not d.is_dir() or not d.name.startswith("DefineSprite_"):
            continue
        f = d / "1.svg"
        if not f.exists():
            continue
        text = f.read_text(errors="replace")

        use = re.search(
            r'<use[^>]*id="mclip_mc"[^>]*transform="matrix\(([^)]*)\)"[^>]*'
            r'xlink:href="#(sprite\d+)"', text)
        if not use:
            continue
        place = [float(v) for v in use.group(1).split(",")]
        sprite = use.group(2)

        sprite_use = re.search(
            r'<g id="' + sprite + r'" transform="matrix\(([^)]*)\)">', text)
        if not sprite_use:
            continue
        offset = [float(v) for v in sprite_use.group(1).split(",")]

        chid = re.search(r'characterId="(\d+)"[^>]*id="mclip_mc"', text) or \
            re.search(r'id="mclip_mc"[^>]*characterId="(\d+)"', text)
        if not chid:
            continue
        name = by_chid.get(int(chid.group(1)))
        if not name:
            continue

        offsets[name] = [
            round(place[4] + offset[4], 2),
            round(place[5] + offset[5], 2),
        ]

    for name, entry in rooms.items():
        if name in offsets:
            entry["offset"] = offsets[name]
    manifest["rooms"] = rooms
    manifest_path.write_text(json.dumps(manifest, indent=1), encoding="utf-8")
    print(f"offsets for {len(offsets)} facilities")
    for name, off in sorted(offsets.items()):
        print(f"  {name:12} {off}")


main()
