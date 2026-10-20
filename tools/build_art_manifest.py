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
import zlib
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
    "Wall": "wall",
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


BBOX_CACHE: dict[str, list[int]] = {}


def png_bbox(path: Path) -> list[int] | None:
    """The bounding box of the visible pixels of a PNG, in pixels.

    The original draws its floors and rooms from a fixed origin, which does
    not always line up with the footprint they belong to. Knowing where the
    artwork actually is lets the game place it exactly on its tiles.
    """
    key = f"{path.parent.name}/{path.name}"
    if key in BBOX_CACHE:
        return BBOX_CACHE[key]
    data = path.read_bytes()
    pos, width, height, colour = 8, 0, 0, 6
    idat = b""
    while pos < len(data):
        length = int.from_bytes(data[pos:pos + 4], "big")
        tag = data[pos + 4:pos + 8]
        body = data[pos + 8:pos + 8 + length]
        pos += 12 + length
        if tag == b"IHDR":
            width = int.from_bytes(body[0:4], "big")
            height = int.from_bytes(body[4:8], "big")
            colour = body[9]
        elif tag == b"IDAT":
            idat += body
    if width == 0 or height == 0 or colour not in (2, 6):
        return None
    bpp = 4 if colour == 6 else 3
    raw = zlib.decompress(idat)
    stride = width * bpp
    previous = bytearray(stride)
    x0 = y0 = width
    x1 = y1 = -1
    offset = 0
    for y in range(height):
        filter_type = raw[offset]
        offset += 1
        line = bytearray(raw[offset:offset + stride])
        offset += stride
        for i in range(stride):
            a = line[i - bpp] if i >= bpp else 0
            b = previous[i]
            c = previous[i - bpp] if i >= bpp else 0
            if filter_type == 1:
                line[i] = (line[i] + a) & 255
            elif filter_type == 2:
                line[i] = (line[i] + b) & 255
            elif filter_type == 3:
                line[i] = (line[i] + (a + b) // 2) & 255
            elif filter_type == 4:
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                line[i] = (line[i] + (a if (pa <= pb and pa <= pc) else (b if pb <= pc else c))) & 255
        if bpp == 4:
            for i in range(0, stride, 4):
                if line[i + 3] > 16:
                    px = i // 4
                    if px < x0: x0 = px
                    if px > x1: x1 = px
                    if y < y0: y0 = y
                    if y > y1: y1 = y
        previous = line
    if x1 < 0:
        return None
    BBOX_CACHE[key] = [x0, y0, x1, y1]
    return [x0, y0, x1, y1]


def png_red(path: Path) -> list[int] | None:
    """The bounds of the red markings in a PNG, if it has any.

    The original's floor textures mark the tile a facility can grow into
    with a red outline. The game has no facility that grows, so the frames
    that carry a marking are left out.
    """
    data = path.read_bytes()
    pos, width, height, colour = 8, 0, 0, 6
    idat = b""
    while pos < len(data):
        length = int.from_bytes(data[pos:pos + 4], "big")
        tag = data[pos + 4:pos + 8]
        body = data[pos + 8:pos + 8 + length]
        pos += 12 + length
        if tag == b"IHDR":
            width = int.from_bytes(body[0:4], "big")
            height = int.from_bytes(body[4:8], "big")
            colour = body[9]
        elif tag == b"IDAT":
            idat += body
    if width == 0 or height == 0 or colour not in (2, 6):
        return None
    bpp = 4 if colour == 6 else 3
    raw = zlib.decompress(idat)
    stride = width * bpp
    previous = bytearray(stride)
    x0 = y0 = width
    x1 = y1 = -1
    count = 0
    offset = 0
    for y in range(height):
        filter_type = raw[offset]
        offset += 1
        line = bytearray(raw[offset:offset + stride])
        offset += stride
        for i in range(stride):
            a = line[i - bpp] if i >= bpp else 0
            b = previous[i]
            c = previous[i - bpp] if i >= bpp else 0
            if filter_type == 1:
                line[i] = (line[i] + a) & 255
            elif filter_type == 2:
                line[i] = (line[i] + b) & 255
            elif filter_type == 3:
                line[i] = (line[i] + (a + b) // 2) & 255
            elif filter_type == 4:
                pa, pb, pc = abs(b - c), abs(a - c), abs(a + b - 2 * c)
                line[i] = (line[i] + (a if (pa <= pb and pa <= pc) else (b if pb <= pc else c))) & 255
        for i in range(0, stride, bpp):
            r, g, b = line[i], line[i + 1], line[i + 2]
            if bpp == 4 and line[i + 3] < 60:
                continue
            if r > 120 and r > g + 45 and r > b + 45:
                x = i // bpp
                count += 1
                x0 = min(x0, x)
                x1 = max(x1, x)
                y0 = min(y0, y)
                y1 = max(y1, y)
        previous = line
    if x1 < 0:
        return None
    # A marking is a thin outline; a red carpet is a solid area.
    area = (x1 - x0 + 1) * (y1 - y0 + 1)
    if area == 0 or count > area * 0.3:
        return None
    return [x0, y0, x1, y1, count]


SVG_SIZE_RE = re.compile(r'width="([\d.]+)px"\s+height="([\d.]+)px"|height="([\d.]+)px"\s+width="([\d.]+)px"')


def svg_anchor(path: Path, png_w: int, png_h: int) -> tuple[float, float] | None:
    """Return where the sprite's origin sits inside its exported PNG.

    The SVG the decompiler writes is in its own units, which are not always the
    same as the pixels of the PNG it accompanies: the zoom is sometimes baked
    into the transform and sometimes into the canvas. Scaling the translate by
    the ratio between the two puts the origin in PNG pixels either way.
    """
    text = path.read_text(encoding="utf-8", errors="replace")
    m = MATRIX_RE.search(text)
    if not m:
        return None
    parts = [p.strip() for p in m.group(1).split(",")]
    if len(parts) < 6:
        return None
    try:
        tx, ty = float(parts[4]), float(parts[5])
    except ValueError:
        return None
    size = SVG_SIZE_RE.search(text)
    if not size:
        return (tx, ty)
    w = float(size.group(1) or size.group(4))
    h = float(size.group(2) or size.group(3))
    if w <= 0 or h <= 0:
        return (tx, ty)
    return (tx * png_w / w, ty * png_h / h)


def main() -> int:
    if len(sys.argv) < 5:
        print(__doc__, file=sys.stderr)
        return 2

    png_root = Path(sys.argv[1])
    svg_root = Path(sys.argv[2])
    symbols_csv = Path(sys.argv[3])
    out_dir = Path(sys.argv[4])
    extra_dir = Path(sys.argv[5]) if len(sys.argv) > 5 else None
    labels_path = Path(sys.argv[6]) if len(sys.argv) > 6 else None
    out_dir.mkdir(parents=True, exist_ok=True)

    # The PNGs were exported at twice the original resolution.
    zoom = 2.0

    symbols = load_symbols(symbols_csv)

    # Frame labels tell us which frame is which animation: `walk_front` for a
    # guest, `level_2` for a facility at its second upgrade, `_sand` for the
    # plot's ground. They come from the SWF and are matched by frame number.
    labels: dict[str, dict[str, int]] = {}
    if labels_path and labels_path.exists():
        labels = json.loads(labels_path.read_text())

    # The bounds of every image, cached so a rebuild is quick.
    cache_path = out_dir / "bbox-cache.json"
    BBOX_CACHE.update(json.loads(cache_path.read_text()) if cache_path.exists() else {})

    # Which of the floor frames carry a red marking.
    red_frames: dict[str, bool] = {}
    booth_dir = png_root / "DefineSprite_858_BoothTile"
    if booth_dir.exists():
        for png in booth_dir.glob("*.png"):
            if png_red(png):
                red_frames[f"858_{png.stem}.png"] = True

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
        frame_labels = labels.get(str(chid), {})

        frames = []
        for png in sorted(d.glob("*.png"), key=lambda p: int(FRAME_NUM.findall(p.stem)[0])):
            n = int(FRAME_NUM.findall(png.stem)[0])
            svg = svg_dir / f"{n}.svg"
            dst = out_dir / f"{chid}_{n}.png"
            shutil.copyfile(png, dst)
            w, h = png_size(dst)
            anchor = svg_anchor(svg, w, h) if svg.exists() else None
            ox, oy = anchor if anchor else (w / 2, h)
            frame: dict[str, object] = {
                "file": dst.name, "w": w, "h": h,
                "ox": round(ox, 2), "oy": round(oy, 2),
            }
            box = png_bbox(dst)
            if box:
                frame["bbox"] = box
            # A floor with a red marking is the frame that shows the tile
            # the facility can grow into.
            if red_frames and red_frames.get(dst.name):
                frame["marked"] = True
            for name, frame_no in frame_labels.items():
                if frame_no == n:
                    frame["label"] = name
                    break
            frames.append(frame)

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
    cache_path.write_text(json.dumps(BBOX_CACHE), encoding="utf-8")

    # Standalone bitmaps that are not part of a sprite. The plot floor is a
    # single sand texture that the original tiles across the buildable area.
    for extra in (extra_dir.glob("*.png") if extra_dir else []):
        shutil.copyfile(extra, out_dir / extra.name)
        manifest.setdefault("images", {})[extra.stem] = extra.name  # type: ignore[union-attr]
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=1), encoding="utf-8")

    print(f"booths   : {len(manifest['booths'])}")  # type: ignore[arg-type]
    print(f"visitors : {len(manifest['visitors'])}")  # type: ignore[arg-type]
    print(f"framesets: {', '.join(sorted(manifest['framesets']))}")  # type: ignore[arg-type]
    print(f"other    : {', '.join(sorted(manifest['other']))}")  # type: ignore[arg-type]
    print(f"png files: {len(list(out_dir.glob('*.png')))}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
