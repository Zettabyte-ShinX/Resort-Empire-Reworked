#!/usr/bin/env python3
"""Pack selected Resort Empire sprite frames into Godot texture atlases.

The decompiled export (``exports/sprites``, 32,093 PNGs / 226 MB) is a
reference dump, not runtime content. This tool reads only the symbols you
name, copies only the frames you ask for into ``godot/assets/atlas`` and
writes ``manifest.json`` describing every frame.

Frame numbering matches the export: frame ``N`` is ``N.png`` inside the
symbol folder, and the same number the game data uses (``tiles.json`` ``fr``,
``booths.json`` ``fr`` / ``wall`` / ``wall_alpha``).

Usage
-----
    python3 godot/tools/build_atlas.py
        Curated first slice: floor/grass tiles, the Lobby booth, Visitor1's
        walking animation and the HUD.

    python3 godot/tools/build_atlas.py TileClip
        Every frame of one symbol (all 28 tile frames).

    python3 godot/tools/build_atlas.py TileClip:10,11,14  Visitor1:walk_front
        Explicit frames: 1-based numbers or SWF frame labels.

    python3 godot/tools/build_atlas.py 129
        Anonymous symbols are addressable by sprite id.

Output (default ``godot/assets/atlas/``):

    atlas_0.png, atlas_1.png ...   packed RGBA pages
    manifest.json                  symbol, frame, atlas, region, offset/pivot

Manifest conventions
--------------------
``pivot``
    Pixel inside the *untrimmed* frame that is the symbol's origin.
``offset``
    Where the untrimmed frame's top-left corner sits relative to that origin;
    always ``(-pivot.x, -pivot.y)``. Draw the page region at
    ``offset + crop.xy`` to reproduce the original composition.
``crop``
    Trimmed rectangle inside the untrimmed frame (transparent margins removed
    to save atlas space).
``region``
    The same pixels inside the atlas page.

Only the Python standard library plus Pillow is required.
"""

from __future__ import annotations

import argparse
import json
import math
import re
import struct
import sys
import zlib
from pathlib import Path

try:
    from PIL import Image
except ImportError:  # pragma: no cover - dependency hint
    sys.exit("build_atlas.py needs Pillow: python3 -m pip install pillow")

REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_DATA = REPO_ROOT / "godot" / "data"
DEFAULT_OUT = REPO_ROOT / "godot" / "assets" / "atlas"

MANIFEST_VERSION = 1
FPS = 23  # the original SWF runs at 23 fps
ATLAS_PADDING = 2
ATLAS_SIZE = 1024

# Pivot policy per art group.  See README notes in the manifest.
#   tile  - centre of the 51x27 cell (the 48x24 diamond is centred in it)
#   booth - bottom-centre of the trimmed art, i.e. the front (south) corner
#           of the footprint; the Flash cell anchor is (25, 85) in a
#           240x136 cell, which the per-frame export does not record
#   actor - bottom-centre of the frame (the feet)
#   hud   - top-left corner (UI is laid out in screen space)
PIVOT_POLICY = {
    "tile": {"anchor": "center", "basis": "cell centre"},
    "booth": {"anchor": "content_bottom_center", "basis": "front corner of footprint"},
    "actor": {"anchor": "bottom_center", "basis": "feet"},
    "hud": {"anchor": "top_left", "basis": "screen-space UI"},
}

# HUD button symbols: two frames each (normal / hover).
HUD_BUTTONS = (
    "btn_scenery",
    "btn_arrowMouse",
    "btn_dragMouse",
    "btn_tips",
    "btn_facility",
    "btn_tile",
    "btn_destroy",
    "btn_janitorPos",
    "btn_expand",
    "btn_extra",
    "btn_room",
)

SPRITE_DIR_RE = re.compile(r"^DefineSprite_(\d+)(?:_(.*))?$")


class Entry:
    """One symbol (or one slice of a symbol) to pack."""

    def __init__(self, symbol, frames=None, name=None, group=None, labels=None):
        self.symbol = symbol          # folder, class name or sprite id
        self.frames = frames          # None = all, else list of 1-based ints
        self.name = name or symbol    # logical name written to the manifest
        self.group = group            # None = infer from the symbol name
        self.labels = labels or {}    # frame -> label supplied by game data


def infer_group(folder: str) -> str:
    """Pick a pivot policy for symbols given on the command line."""
    name = folder.lower()
    if "visitor" in name:
        return "actor"
    if "boothtile" in name or "wall" in name:
        return "booth"
    if any(
        token in name
        for token in ("navigator", "btn_", "pic_nav", "icon_", "dialog_", "stat", "tab")
    ):
        return "hud"
    return "tile"


# --------------------------------------------------------------------------
# symbol index
# --------------------------------------------------------------------------

class SymbolIndex:
    def __init__(self, sprites_dir: Path):
        self.root = sprites_dir
        self.by_id = {}
        self.by_folder = {}
        self.by_class = {}
        self.by_short = {}

        if not sprites_dir.is_dir():
            raise SystemExit(f"sprite export not found: {sprites_dir}")

        for folder in sorted(sprites_dir.iterdir()):
            if not folder.is_dir():
                continue
            match = SPRITE_DIR_RE.match(folder.name)
            if not match:
                continue
            sprite_id, klass = match.group(1), match.group(2)
            self.by_id[sprite_id] = folder.name
            self.by_folder[folder.name] = folder.name
            if not klass:
                continue
            self.by_class.setdefault(klass, []).append(folder.name)
            # "ResortEmpire_fla.navigator1_617" -> "navigator1"
            short = klass.split(".")[-1]
            short = re.sub(r"_\d+$", "", short)
            self.by_short.setdefault(short, []).append(folder.name)

    def resolve(self, query: str) -> str:
        """Map a user-supplied symbol name to an export folder name."""
        query = query.strip()
        if query in self.by_folder:
            return query
        if query.isdigit() and query in self.by_id:
            return self.by_id[query]

        for table in (self.by_class, self.by_short):
            hits = table.get(query)
            if hits:
                if len(hits) > 1:
                    raise SystemExit(
                        f"symbol {query!r} is ambiguous: {', '.join(sorted(hits))}"
                    )
                return hits[0]

        lowered = query.lower()
        hits = sorted(
            folder
            for folder in self.by_folder
            if query.lower() in folder.lower()
        )
        if len(hits) == 1:
            return hits[0]
        if hits:
            raise SystemExit(
                f"symbol {query!r} matches several exports:\n  " + "\n  ".join(hits[:20])
            )
        raise SystemExit(f"no exported sprite matches {query!r}")

    def frame_files(self, folder: str) -> dict[int, Path]:
        """1-based frame number -> PNG path."""
        directory = self.root / folder
        frames = {}
        for path in directory.iterdir():
            if path.suffix.lower() != ".png":
                continue
            if path.stem.isdigit():
                frames[int(path.stem)] = path
        if not frames:
            raise SystemExit(f"no PNG frames in {directory}")
        return dict(sorted(frames.items()))


# --------------------------------------------------------------------------
# SWF frame labels (best effort; only used to name frames)
# --------------------------------------------------------------------------

def _swf_body(path: Path):
    data = path.read_bytes()
    if data[:3] == b"CWS":
        return zlib.decompress(data[8:])
    if data[:3] == b"FWS":
        return data[8:]
    return None


def _swf_tags(body, start):
    index = start
    total = len(body)
    while index + 2 <= total:
        record = struct.unpack("<H", body[index:index + 2])[0]
        index += 2
        code = record >> 6
        length = record & 0x3F
        if length == 0x3F:
            length = struct.unpack("<I", body[index:index + 4])[0]
            index += 4
        yield code, body[index:index + length]
        index += length


def read_frame_labels(swf_path: Path) -> dict[int, dict[int, list[str]]]:
    """sprite id -> {1-based frame: [labels]}.

    A FrameLabel tag sits before the ShowFrame of the frame it names, so the
    label belongs to ``show_frames + 1`` — the same 1-based numbering as the
    exported PNG files.
    """
    try:
        body = _swf_body(swf_path)
    except OSError:
        return {}
    if body is None:
        return {}

    nbits = body[0] >> 3
    offset = (5 + 4 * nbits + 7) // 8 + 4  # rect + frame rate + frame count
    labels: dict[int, dict[int, list[str]]] = {}

    for code, data in _swf_tags(body, offset):
        if code != 39 or len(data) < 4:  # DefineSprite
            continue
        sprite_id = struct.unpack("<H", data[:2])[0]
        show_frames = 0
        found = {}
        for inner_code, inner in _swf_tags(data, 4):
            if inner_code == 1:  # ShowFrame
                show_frames += 1
            elif inner_code == 43:  # FrameLabel
                name = inner.split(b"\x00", 1)[0].decode("latin-1").strip()
                if name:
                    found.setdefault(show_frames + 1, []).append(name)
        if found:
            labels[sprite_id] = found
    return labels


def display_path(path: Path) -> str:
    """Repo-relative when possible, so the manifest stays portable."""
    try:
        return path.relative_to(REPO_ROOT).as_posix()
    except ValueError:
        return str(path)


def find_swf(exports: Path) -> Path | None:
    for candidate in (
        exports / "scripts" / "_assets" / "assets.swf",
        REPO_ROOT / "ResortEmpire.swf",
    ):
        if candidate.is_file():
            return candidate
    return None


# --------------------------------------------------------------------------
# first slice
# --------------------------------------------------------------------------

def first_slice(data_dir: Path) -> tuple[list[Entry], dict]:
    """The curated first slice, driven by the game data files."""
    entries: list[Entry] = []
    notes: dict = {}

    tiles_path = data_dir / "tiles.json"
    if not tiles_path.is_file():
        raise SystemExit(f"missing data file: {tiles_path}")
    tiles = json.loads(tiles_path.read_text(encoding="utf-8"))

    # Purchasable floor/grass tiles plus the default empty ground.  Their art
    # is TileClip frame `fr`; the internal tiles (halang/corner/tehel) are
    # drawn by other symbols and are not part of this slice.
    tile_frames: list[int] = []
    tile_labels: dict[int, str] = {}
    tile_ids: list[str] = []
    for tile_id in tiles["order"]:
        record = tiles["items"].get(tile_id)
        if not isinstance(record, dict):
            continue
        if record.get("mainJenis") not in (0, 1):
            continue
        frame = record.get("fr")
        if not isinstance(frame, int) or frame < 1:
            continue
        # Include every tile frame so the starting map and all purchasable
        # tiles can be rendered (internal/empty tiles included).
        tile_ids.append(tile_id)
        if frame not in tile_frames:
            tile_frames.append(frame)
        label = record.get("lbl")
        if label and frame not in tile_labels:
            tile_labels[frame] = str(label)
    entries.append(
        Entry("TileClip", sorted(tile_frames), name="TileClip", group="tile",
              labels=tile_labels)
    )
    notes["tiles"] = tile_ids

    booths_path = data_dir / "booths.json"
    booths = json.loads(booths_path.read_text(encoding="utf-8")) if booths_path.is_file() else {"booths": {}}
    booth_names = tuple(booths["booths"].keys())
    if booths_path.is_file():
        notes["booths"] = {}
        for booth_name in booth_names:
            booth = booths["booths"][booth_name]
            body = int(booth["fr"])
            wall = int(booth["wall"])
            wall_alpha = int(booth["wall_alpha"])
            levels = 3  # level_ - 1 offsets used by Booth.as
            entries.append(
                Entry("BoothTile", [body + i for i in range(levels)],
                      name=f"{booth_name}.body", group="booth")
            )
            entries.append(
                Entry("Wall", [wall + i for i in range(levels)],
                      name=f"{booth_name}.wall", group="booth")
            )
            entries.append(
                Entry("Wall", [wall_alpha + i for i in range(levels)],
                      name=f"{booth_name}.wall_alpha", group="booth")
            )
            notes["booths"][booth_name] = {
                "name": booth_name,
                "rows": booth.get("ROWS"),
                "cols": booth.get("COLS"),
                "body_frames": [body + i for i in range(levels)],
                "wall_frames": [wall + i for i in range(levels)],
                "wall_alpha_frames": [wall_alpha + i for i in range(levels)],
            }
    else:
        raise SystemExit(f"missing data file: {booths_path}")

    # Visitor1 is the clip the game instantiates; its four labelled frames are
    # stand_front, walk_front, stand_back, walk_back.  The actual walk cycles
    # are the sprites nested in the walk frames (129 front, 13 back).
    entries.append(Entry("Visitor1", None, name="Visitor1", group="actor"))
    entries.append(Entry("129", None, name="Visitor1.walk_front", group="actor"))
    entries.append(Entry("13", None, name="Visitor1.walk_back", group="actor"))
    notes["visitor"] = {
        "symbol": "Visitor1",
        "walk_front": 129,
        "walk_back": 13,
        "fps": FPS,
    }

    for name in ("navigator1", "navigator2", "navigator3"):
        entries.append(Entry(name, None, name=f"HUD.{name}", group="hud"))

    dialog_symbols = {
        "dialog_facility": "3142",
        "dialog_room": "3205",
        "dialog_scenery": "3230",
        "dialog_tile": "3184",
        "dialog_tips": "3200",
        "statD": "3903",
        "acvD": "3853",
        "legendD": "3829",
        "optionD": "3869",
        "menuD": "3864",
        "propertyD": "3485",
        "dialog_extra": "3640",
    }
    for dialog_name, sprite_id in dialog_symbols.items():
        entries.append(Entry(sprite_id, None, name=dialog_name, group="hud"))
    for name in HUD_BUTTONS:
        entries.append(Entry(name, None, name=f"HUD.{name}", group="hud"))
    notes["hud"] = ["navigator1", "navigator2", "navigator3", *HUD_BUTTONS]

    return entries, notes


# --------------------------------------------------------------------------
# selection
# --------------------------------------------------------------------------

def parse_symbol_arg(text: str) -> Entry:
    """``Symbol`` or ``Symbol:frame,frame`` (numbers or SWF labels)."""
    if ":" not in text:
        return Entry(text, None, name=text)
    symbol, spec = text.split(":", 1)
    return Entry(symbol.strip(), [part.strip() for part in spec.split(",") if part.strip()],
                 name=symbol.strip())


def resolve_frames(entry: Entry, files: dict[int, Path], labels: dict[int, list[str]]):
    """Turn an entry's frame selector into ordered 1-based frame numbers."""
    available = list(files)
    if entry.frames is None:
        return available

    by_label = {}
    for number, names in labels.items():
        for label in names:
            by_label.setdefault(label, []).append(number)

    chosen = []
    for token in entry.frames:
        if isinstance(token, int):
            number = token
        elif token.lstrip("-").isdigit():
            number = int(token)
        elif token in by_label:
            number = by_label[token][0]
        else:
            raise SystemExit(
                f"{entry.symbol}: unknown frame {token!r} (no such number or label)"
            )
        if number not in files:
            raise SystemExit(
                f"{entry.symbol}: frame {number} missing "
                f"(available {available[0]}..{available[-1]})"
            )
        if number not in chosen:
            chosen.append(number)
    return chosen


# --------------------------------------------------------------------------
# packing
# --------------------------------------------------------------------------

def next_power_of_two(value: int) -> int:
    return 1 << max(0, math.ceil(math.log2(max(1, value))))


def _skyline_insert(skyline, left: int, top: int, width: int):
    """Raise the skyline over [left, left+width) to `top`."""
    right = left + width
    segments = []
    for seg_left, seg_top, seg_width in skyline:
        seg_right = seg_left + seg_width
        if seg_right <= left or seg_left >= right:
            segments.append((seg_left, seg_top, seg_width))
            continue
        if seg_left < left:
            segments.append((seg_left, seg_top, left - seg_left))
        if seg_right > right:
            segments.append((right, seg_top, seg_right - right))
    segments.append((left, top, width))
    segments.sort()

    merged = []
    for segment in segments:
        if (
            merged
            and merged[-1][1] == segment[1]
            and merged[-1][0] + merged[-1][2] == segment[0]
        ):
            merged[-1] = (merged[-1][0], segment[1], merged[-1][2] + segment[2])
        else:
            merged.append(segment)
    return merged


def _skyline_place(skyline, width: int, height: int, atlas_size: int):
    """Lowest free position that fits, or None."""
    best = None
    for start, (left, base_top, _) in enumerate(skyline):
        # Skyline segments tile [0, atlas_size) contiguously, so a frame can
        # span several of them; take the highest surface it would rest on.
        needed = width
        top = base_top
        index = start
        while needed > 0 and index < len(skyline):
            top = max(top, skyline[index][1])
            needed -= skyline[index][2]
            index += 1
        if needed > 0:
            break  # no room to the right of this segment
        if top + height > atlas_size:
            continue
        score = (top + height, left)
        if best is None or score < best[0]:
            best = (score, left, top)
    return None if best is None else (best[1], best[2])


def skyline_pack(sizes, atlas_size: int, padding: int):
    """Bottom-left skyline packing.

    Frames are placed at the lowest spot that fits, which keeps the page
    height (and therefore the texture memory) close to the content area.
    Returns (pages, placement) where pages[p] lists (index, x, y, w, h) and
    placement maps index to (page, x, y, w, h).
    """
    order = sorted(range(len(sizes)), key=lambda i: (-sizes[i][1], -sizes[i][0]))
    pages: list[list] = []
    placement = {}
    skyline = [(0, 0, atlas_size)]
    page = 0
    slots: list = []

    for index in order:
        width, height = sizes[index]
        if width > atlas_size or height > atlas_size:
            raise SystemExit(
                f"frame {width}x{height} does not fit in a {atlas_size}px atlas; "
                "raise --atlas-size"
            )
        padded_width = width + padding
        padded_height = height + padding
        spot = _skyline_place(skyline, padded_width, padded_height, atlas_size)
        if spot is None:
            pages.append(slots)
            slots = []
            page += 1
            skyline = [(0, 0, atlas_size)]
            spot = _skyline_place(skyline, padded_width, padded_height, atlas_size)
            if spot is None:  # cannot happen while both edges fit
                raise SystemExit(f"frame {width}x{height} does not fit")
        x, y = spot
        placement[index] = (page, x, y, width, height)
        slots.append((index, x, y, width, height))
        skyline = _skyline_insert(skyline, x, y + padded_height, padded_width)

    pages.append(slots)
    return pages, placement


def pivot_for(group: str, width: int, height: int, bbox) -> tuple[int, int]:
    if group == "hud":
        return 0, 0
    if group == "booth":
        left, top, right, bottom = bbox
        return int(round((left + right) / 2)), int(round(bottom))
    if group == "actor":
        return width // 2, height
    return width // 2, height // 2


# --------------------------------------------------------------------------
# build
# --------------------------------------------------------------------------

def build(args) -> int:
    exports = Path(args.exports).expanduser().resolve()
    sprites = exports / "sprites"
    out_dir = Path(args.out).expanduser().resolve()
    data_dir = Path(args.data).expanduser().resolve()

    index = SymbolIndex(sprites)
    swf_path = Path(args.swf).expanduser().resolve() if args.swf else find_swf(exports)
    labels_by_sprite = read_frame_labels(swf_path) if swf_path else {}

    if args.symbols:
        entries = [parse_symbol_arg(text) for text in args.symbols]
        slice_notes = {}
    else:
        entries, slice_notes = first_slice(data_dir)

    # ---- collect frames -------------------------------------------------
    jobs = []          # dicts ready for packing
    seen_keys = set()
    for entry in entries:
        folder = index.resolve(entry.symbol)
        sprite_id = int(SPRITE_DIR_RE.match(folder).group(1))
        group = entry.group or infer_group(folder)
        files = index.frame_files(folder)
        labels = labels_by_sprite.get(sprite_id, {})
        frames = resolve_frames(entry, files, labels)

        for number in frames:
            key = (entry.name, number)
            if key in seen_keys:
                continue
            seen_keys.add(key)

            with Image.open(files[number]) as source:
                image = source.convert("RGBA")
            width, height = image.size

            if args.no_trim:
                bbox = (0, 0, width, height)
            else:
                bbox = image.getbbox() or (0, 0, 1, 1)
            left, top, right, bottom = bbox
            trimmed = image.crop(bbox)

            pivot = pivot_for(group, width, height, bbox)
            label = entry.labels.get(number)
            if label is None:
                names = labels.get(number)
                label = names[0] if names else None

            jobs.append(
                {
                    "id": f"{entry.name}::{number}",
                    "symbol": entry.name,
                    "source": folder,
                    "sprite_id": sprite_id,
                    "frame": number,
                    "label": label,
                    "group": group,
                    "image": trimmed,
                    "source_size": [width, height],
                    "crop": [left, top, right - left, bottom - top],
                    "pivot": [int(pivot[0]), int(pivot[1])],
                    "offset": [-int(pivot[0]), -int(pivot[1])],
                }
            )

    if not jobs:
        raise SystemExit("nothing selected")

    # ---- pack -----------------------------------------------------------
    sizes = [(job["image"].width, job["image"].height) for job in jobs]
    pages, placement = skyline_pack(sizes, args.atlas_size, args.padding)

    out_dir.mkdir(parents=True, exist_ok=True)
    for stale in out_dir.glob("atlas_*.png"):
        stale.unlink()

    page_stats = []
    for page_index, slots in enumerate(pages):
        used_height = max((y + h for _, _, y, _, h in slots), default=0)
        used_width = max((x + w for _, x, _, w, _ in slots), default=0)
        height = min(args.atlas_size, next_power_of_two(max(used_height, 1)))
        width = min(args.atlas_size, next_power_of_two(max(used_width, 1)))
        canvas = Image.new("RGBA", (width, height), (0, 0, 0, 0))
        for index_, slot_x, slot_y, _slot_w, _slot_h in slots:
            canvas.alpha_composite(jobs[index_]["image"], (slot_x, slot_y))
        name = f"atlas_{page_index}.png"
        path = out_dir / name
        canvas.save(path, optimize=True)
        page_stats.append(
            {
                "file": name,
                "width": width,
                "height": height,
                "bytes": path.stat().st_size,
                "texture_bytes": width * height * 4,
            }
        )

    # ---- manifest -------------------------------------------------------
    frame_entries = []
    for index_, job in enumerate(jobs):
        page, x, y, width, height = placement[index_]
        frame_entries.append(
            {
                "id": job["id"],
                "symbol": job["symbol"],
                "source": job["source"],
                "sprite_id": job["sprite_id"],
                "frame": job["frame"],
                "label": job["label"],
                "group": job["group"],
                "atlas": page_stats[page]["file"],
                "region": [x, y, width, height],
                "crop": job["crop"],
                "source_size": job["source_size"],
                "pivot": job["pivot"],
                "offset": job["offset"],
            }
        )

    clips = {}
    if not args.symbols:
        for name in ("Visitor1.walk_front", "Visitor1.walk_back"):
            ids = [f["id"] for f in frame_entries if f["symbol"] == name]
            if ids:
                clips[name] = {"frames": ids, "fps": FPS, "loop": True}

    disk_total = sum(page["bytes"] for page in page_stats)
    texture_total = sum(page["texture_bytes"] for page in page_stats)
    raw_total = sum(
        job["source_size"][0] * job["source_size"][1] * 4 for job in jobs
    )
    trimmed_area = sum(job["image"].width * job["image"].height for job in jobs)
    raw_area = sum(job["source_size"][0] * job["source_size"][1] for job in jobs)
    atlas_area = sum(page["width"] * page["height"] for page in page_stats)

    manifest = {
        "version": MANIFEST_VERSION,
        "generator": "godot/tools/build_atlas.py",
        "source": {
            "exports": display_path(exports),
            "swf": display_path(swf_path) if swf_path else None,
            "atlas_size": args.atlas_size,
            "padding": args.padding,
            "trimmed": not args.no_trim,
        },
        "pivot_policy": PIVOT_POLICY,
        "conventions": {
            "pivot": "pixel in the untrimmed frame that is the symbol origin",
            "offset": "untrimmed frame top-left relative to the origin = [-pivot.x, -pivot.y]",
            "crop": "trimmed rect inside the untrimmed frame",
            "region": "rect inside the atlas page",
            "draw": "place the region at offset + crop.xy to keep the original composition",
        },
        "slice": slice_notes,
        "pages": page_stats,
        "frames": frame_entries,
        "clips": clips,
        "stats": {
            "frames": len(frame_entries),
            "symbols": len({f["symbol"] for f in frame_entries}),
            "pages": len(page_stats),
            "atlas_pixels": atlas_area,
            "content_pixels": trimmed_area,
            "fill_ratio": round(trimmed_area / atlas_area, 4) if atlas_area else 0.0,
            "disk_bytes": disk_total,
            "texture_bytes": texture_total,
            "untrimmed_texture_bytes": raw_total,
            "source_pixels": raw_area,
            "trimmed_pixels_saved": raw_area - trimmed_area,
        },
    }

    manifest_path = out_dir / "manifest.json"
    manifest_path.write_text(
        json.dumps(manifest, indent=2, sort_keys=False) + "\n", encoding="utf-8"
    )

    # ---- report ---------------------------------------------------------
    print(f"exports : {display_path(exports)}")
    print(f"swf     : {display_path(swf_path) if swf_path else '(none - frame labels unavailable)'}")
    print(f"out     : {display_path(out_dir)}")
    print()
    print(f"{'symbol':28s} {'frames':>6s}  {'source':>7s}  pivot")
    by_symbol = {}
    for frame in frame_entries:
        record = by_symbol.setdefault(
            frame["symbol"],
            {"count": 0, "group": frame["group"], "pivot": frame["pivot"]},
        )
        record["count"] += 1
    for name in sorted(by_symbol):
        record = by_symbol[name]
        print(
            f"{name:28s} {record['count']:6d}  {record['group']:>7s}  "
            f"({record['pivot'][0]}, {record['pivot'][1]})"
        )
    print()
    for page in page_stats:
        print(
            f"{page['file']}: {page['width']}x{page['height']}  "
            f"{page['bytes'] / 1024:8.1f} KiB on disk  "
            f"{page['texture_bytes'] / 1048576:6.2f} MiB RGBA8"
        )
    print()
    print(f"frames          : {len(frame_entries)}")
    print(f"atlas size      : {disk_total / 1024:.1f} KiB on disk")
    print(f"texture memory  : {texture_total / 1048576:.2f} MiB RGBA8 (uncompressed)")
    print(
        f"atlas fill      : {trimmed_area / atlas_area:.0%} "
        f"({trimmed_area:,} of {atlas_area:,} px)"
    )
    print(
        f"trim            : {raw_area:,} px of frames -> {trimmed_area:,} px "
        f"({(1 - trimmed_area / raw_area):.0%} margins removed)" if raw_area else ""
    )
    print(f"manifest        : {manifest_path}")
    return 0


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        description="Pack Resort Empire sprite frames into Godot atlases.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__.split("Usage")[1] if "Usage" in __doc__ else None,
    )
    parser.add_argument("symbols", nargs="*",
                        help="symbol[:frame,frame...]; defaults to the first slice")
    parser.add_argument("--exports", default=str(REPO_ROOT / "exports"),
                        help="decompiled export folder (default: <repo>/exports)")
    parser.add_argument("--out", default=str(DEFAULT_OUT),
                        help="atlas output folder (default: godot/assets/atlas)")
    parser.add_argument("--data", default=str(DEFAULT_DATA),
                        help="game data folder (default: godot/data)")
    parser.add_argument("--swf", default=None,
                        help="SWF to read frame labels from (default: auto)")
    parser.add_argument("--atlas-size", type=int, default=ATLAS_SIZE,
                        help=f"max atlas edge in pixels (default {ATLAS_SIZE})")
    parser.add_argument("--padding", type=int, default=ATLAS_PADDING,
                        help=f"pixel gap between frames (default {ATLAS_PADDING})")
    parser.add_argument("--no-trim", action="store_true",
                        help="keep transparent margins instead of cropping")
    args = parser.parse_args(argv)
    if args.atlas_size < 64:
        parser.error("--atlas-size must be at least 64")
    return build(args)


if __name__ == "__main__":
    raise SystemExit(main())
