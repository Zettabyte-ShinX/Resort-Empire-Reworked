#!/usr/bin/env python3
"""Take the plot marking out of the original's floor plates.

The original's `BoothTile` clip has a `ground` child on every plate of a
facility: a red outline on the tile the facility can still grow into. The
original hides that child before it draws the plates out of the clip
(`Application.as`, `ground.hiding()`), so the marking is never on the map.

The plates are therefore drawn again without the child, which is what the
original's map shows.

Usage:
    python3 tools/strip_ground.py <svg-dir> <art-dir> <manifest>
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from build_art_manifest import png_bbox, png_size, svg_anchor  # noqa: E402

USE_RE = re.compile(r"<use\b[^>]*/>")


def main() -> int:
    if len(sys.argv) != 4:
        print(__doc__, file=sys.stderr)
        return 2
    svg_root, art_dir, manifest_path = (Path(a) for a in sys.argv[1:4])
    manifest = json.loads(manifest_path.read_text())
    rsvg = shutil.which("rsvg-convert")
    if not rsvg:
        print("rsvg-convert is needed to draw the plates", file=sys.stderr)
        return 1
    tmp = svg_root / "_plate_tmp.svg"

    framesets = manifest.get("framesets", {})
    changed = 0
    for name, entry in framesets.items():
        chid = entry["chid"]
        svg_dir = None
        for d in sorted(svg_root.iterdir()):
            if d.is_dir() and d.name.startswith(f"DefineSprite_{chid}_"):
                svg_dir = d
                break
        if not svg_dir:
            continue
        for frame in entry["frames"]:
            stem = Path(frame["file"]).stem
            number = stem.rsplit("_", 1)[-1]
            svg = svg_dir / f"{number}.svg"
            if not svg.exists():
                continue
            text = svg.read_text(encoding="utf-8", errors="replace")
            if 'id="ground"' not in text:
                continue
            # The original hides the marking, so the plate is drawn without it.
            for use in USE_RE.findall(text):
                if 'id="ground"' in use:
                    text = text.replace(use, "")
            out = art_dir / f"plate_{chid}_{number}.png"
            tmp.write_text(text, encoding="utf-8")
            subprocess.run([rsvg, "-z", "2", "-b", "none", "-o", str(out), str(tmp)], check=True)
            w, h = png_size(out)
            anchor = svg_anchor(svg, w, h)
            ox, oy = anchor if anchor else (w / 2, h)
            frame["file"] = out.name
            frame["w"] = w
            frame["h"] = h
            frame["ox"] = round(ox, 2)
            frame["oy"] = round(oy, 2)
            if box := png_bbox(out):
                frame["bbox"] = box
            else:
                frame.pop("bbox", None)
            changed += 1
    if tmp.exists():
        tmp.unlink()
    manifest_path.write_text(json.dumps(manifest, indent=1), encoding="utf-8")
    print(f"plates redrawn without the marking: {changed}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
