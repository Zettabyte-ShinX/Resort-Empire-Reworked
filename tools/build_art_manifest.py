#!/usr/bin/env python3
"""Build the web game's art manifest from the sprites exported out of the SWF.

JPEXS can export each `DefineSprite` two ways:

  * as PNG  - a cropped raster of the visible pixels
  * as SVG  - the same frame, but with the sprite's coordinate space intact

The SVG's outer `<g transform="matrix(a,b,c,d,tx,ty)">` tells us where the
sprite's own origin (0,0 in Flash) ended up inside that crop, which is
exactly the anchor point the renderer needs to place the art on the grid.

So we export both, and combine them into one manifest:

    frame = { file, w, h, ox, oy }

where (ox, oy) is the sprite origin in PNG pixels, measured from the top left.

Usage:
    python3 tools/build_art_manifest.py <png-dir> <svg-dir> <symbols.csv> <out-dir>
"""

from __future__ import annotations

import json
import re
import shutil
import sys
from pathlib import Path

BOOTH_CLASSES = {
    "ClipLobby": "Lobby",
    "ClipCottage": "Cottage",
    "ClipLodge": "Lodge",
    "ClipPool": "Pool",
    "ClipArcade": "Arcade",
    "ClipGym": "Gym",
    "ClipSpa": "Spa",
    "ClipSauna": "Sauna",
    "ClipJacuzi": "Jacuzi",
    "ClipBar": "Bar",
    "ClipIndiaResto": "IndiaResto",
    "ClipJapanResto": "JapanResto",
    "ClipBaratResto": "BaratResto",
    "ClipGiftshop": "Giftshop",
    "ClipMinimarket": "Minimarket",
    "ClipMedical": "Medical",
    "ClipGolf": "Golf",
    "ClipIcecream": "Icecream",
    "ClipHotdog": "Hotdog",
    "ClipTaco": "Taco",
    "ClipJanitor": "Janitor",
    "ClipJanitorRoom": "JanitorRoom",
}

FRAME_SETS = {
    "TileClip": "tiles",
    "Scenery": "plants",
    "SandTile": "sand",
    "BoothTile": "boothTile",
    "Plant": "plantMarker",
}

VISITOR_RE = re.compile(r"^Visitor(\d+)$")
DIR_RE = re.compile(r"^DefineSprite_(\d+)(?:_(.*))?$")
MATRIX_RE = re.compile(r'<g transform="matrix\(([^)]*)\)"')
FRAME_NUM = re.compile(r"\d+")


def load_symbols(csv_path: Path) -> dict[int, str]:
    out: dict[int, str] = {}
    for line in csv_path.read_text(encoding="utf-8", errors="replace").splitlines():
        if ";" not in line:
            continue
        left, right = line.split(";", 1)
        try:
            out[int(left.strip())] = right.strip().strip('"')
        except ValueError:
            continue
    return out


def png_size(path: Path) -> tuple[int, int]:
    with path.open("rb") as f:
        head = f.read(24)
    if len(head) < 24 or head[:8] != b"\x89PNG\r\n\x1a\n":
        return (0, 0)
    return (int.from_bytes(head[16:20], "big"), int.from_bytes(head[20:24], "big"))


def svg_anchor(path: Path) -> tuple[float, float] | None:
    """Return the (tx, ty) translate of the SVG's outer group."""
    text = path.read_text(encoding="utf-8", errors="replace")
    m = MATRIX_RE.search(text)
    if not m:
        return None
    parts = [p.strip() for p in m.group(1).split(",")]
    if len(parts) < 6:
        return None
    try:
        return (float(parts[4]), float(parts[5]))
    except ValueError:
        return None


def main() -> int:
    if len(sys.argv) < 5:
        print(__doc__, file=sys.stderr)
        return 2

    png_root = Path(sys.argv[1])
    svg_root = Path(sys.argv[2])
    symbols_csv = Path(sys.argv[3])
    out_dir = Path(sys.argv[4])
    out_dir.mkdir(parents=True, exist_ok=True)

    # The PNGs were exported at twice the original resolution.
    zoom = 2.0

    symbols = load_symbols(symbols_csv)

    manifest: dict[str, object] = {"booths": {}, "visitors": {}, "framesets": {}, "other": {}}

    for d in sorted(png_root.iterdir()):
        m = DIR_RE.match(d.name)
        if not m or not d.is_dir():
            continue
        chid = int(m.group(1))
        cls = m.group(2) or symbols.get(chid, "")
        short = cls.split(".")[-1] if cls else ""
        # The original appends a numeric suffix to most class names
        # (`ClipCottage_136`); strip it before matching.
        base = re.sub(r"_\d+$", "", short)
        svg_dir = svg_root / d.name

        frames = []
        for png in sorted(d.glob("*.png"), key=lambda p: int(FRAME_NUM.findall(p.stem)[0])):
            n = int(FRAME_NUM.findall(png.stem)[0])
            svg = svg_dir / f"{n}.svg"
            anchor = svg_anchor(svg) if svg.exists() else None
            dst = out_dir / f"{chid}_{n}.png"
            shutil.copyfile(png, dst)
            w, h = png_size(dst)
            ox, oy = (anchor[0] * zoom, anchor[1] * zoom) if anchor else (w / 2, h)
            frames.append({"file": dst.name, "w": w, "h": h, "ox": round(ox, 2), "oy": round(oy, 2)})

        if not frames:
            continue

        entry = {"chid": chid, "class": cls, "frames": frames}

        if base in BOOTH_CLASSES:
            entry["booth"] = BOOTH_CLASSES[base]
            manifest["booths"][BOOTH_CLASSES[base]] = entry  # type: ignore[index]
        elif (vm := VISITOR_RE.match(short)) is not None:
            entry["variant"] = int(vm.group(1))
            manifest["visitors"][vm.group(1)] = entry  # type: ignore[index]
        elif base in FRAME_SETS:
            manifest["framesets"][FRAME_SETS[base]] = entry  # type: ignore[index]
        else:
            manifest["other"][short or str(chid)] = entry  # type: ignore[index]

    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=1), encoding="utf-8")

    print(f"booths   : {len(manifest['booths'])}")  # type: ignore[arg-type]
    print(f"visitors : {len(manifest['visitors'])}")  # type: ignore[arg-type]
    print(f"framesets: {', '.join(sorted(manifest['framesets']))}")  # type: ignore[arg-type]
    print(f"other    : {', '.join(sorted(manifest['other']))}")  # type: ignore[arg-type]
    print(f"png files: {len(list(out_dir.glob('*.png')))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
