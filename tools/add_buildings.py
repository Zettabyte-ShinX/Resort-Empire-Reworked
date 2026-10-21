#!/usr/bin/env python3
"""Add the original's facility buildings to the art manifest.

A facility in the original is two symbols: the booth symbol holds the guests
and the employees that are inside it, and a second symbol holds the building
itself. We were drawing the guest symbol as if it were the building, which
made every facility far too big and buried the plot underneath it.

This walks the exported building symbols, copies their pictures into the art
folder and records where their origin sits, in the same shape the rest of the
manifest uses.

Usage:
    python3 tools/add_buildings.py <png-dir> <svg-dir> <art-dir> <manifest>
"""

from __future__ import annotations

import json
import re
import shutil
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from build_art_manifest import png_bbox, png_size, svg_anchor  # noqa: E402

DIR_RE = re.compile(r"^DefineSprite_(\d+)_(.*)$")
FRAME_NUM = re.compile(r"\d+")


def main() -> int:
    if len(sys.argv) < 5:
        print(__doc__, file=sys.stderr)
        return 2
    png_root, svg_root, art_dir, manifest_path = (Path(a) for a in sys.argv[1:5])
    manifest = json.loads(manifest_path.read_text())
    buildings = manifest.setdefault("buildings", {})

    for d in sorted(png_root.iterdir()):
        m = DIR_RE.match(d.name)
        if not m or not d.is_dir():
            continue
        chid, cls = int(m.group(1)), m.group(2)
        # The building symbols are named after the facility: `JapanResto`,
        # `Cottage`, `Pool`. The booth symbols carry a `Clip` prefix and the
        # numeric suffix the decompiler adds.
        base = re.sub(r"_\d+$", "", cls.split(".")[-1])
        if base.startswith("Clip") or not base:
            continue
        svg_dir = svg_root / d.name
        frames = []
        for png in sorted(d.glob("*.png"), key=lambda p: int(FRAME_NUM.findall(p.stem)[0])):
            n = int(FRAME_NUM.findall(png.stem)[0])
            svg = svg_dir / f"{n}.svg"
            dst = art_dir / f"{chid}_{n}.png"
            shutil.copyfile(png, dst)
            w, h = png_size(dst)
            anchor = svg_anchor(svg, w, h) if svg.exists() else None
            ox, oy = anchor if anchor else (w / 2, h)
            frame: dict[str, object] = {
                "file": dst.name, "w": w, "h": h,
                "ox": round(ox, 2), "oy": round(oy, 2),
            }
            if box := png_bbox(dst):
                frame["bbox"] = box
            frames.append(frame)
        if frames:
            buildings[base] = {"chid": chid, "class": cls, "frames": frames}

    manifest_path.write_text(json.dumps(manifest, indent=1), encoding="utf-8")
    print(f"buildings : {len(buildings)}")
    for name, entry in sorted(buildings.items()):
        print(f"  {name:16} chid {entry['chid']:6} {len(entry['frames'])} frames")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
