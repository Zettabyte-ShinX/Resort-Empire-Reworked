#!/usr/bin/env python3
"""Split a facility's room art from the people standing in it.

The original draws a facility in three layers: the plot it stands on, the
floor of the room, and the room itself. The room's clip holds the furniture
and the people together, and the original hides the people while the room is
empty, so a room with no guests shows only its furniture.

The clip is exported as one picture, so the people have to be taken out of
it. The room is drawn from the same drawing the decompiler writes, with the
people left out, and each person is drawn on its own, at the place the
original puts them in the room.

Usage:
    python3 tools/split_rooms.py <svg-dir> <art-dir> <manifest>
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

# The children of a room clip that stand in it.
PEOPLE = ("employee", "visitor1", "visitor2")
USE_RE = re.compile(r"<use\b[^>]*/>")
ID_RE = re.compile(r'id="([^"]+)"')
CHAR_RE = re.compile(r'ffdec:characterId="(\d+)"')
CLASS_RE = re.compile(r'ffdec:characterName="([^"]+)"')
MATRIX_RE = re.compile(r'transform="matrix\(([^)]*)\)"')


def find_svg_dir(svg_root: Path, chid: int) -> Path | None:
    for d in sorted(svg_root.iterdir()):
        if d.is_dir() and d.name.startswith(f"DefineSprite_{chid}_"):
            return d
    return None


def uses(text: str) -> list[str]:
    return USE_RE.findall(text)


def drop(text: str, keep: set[str]) -> str:
    """Take the people out of a clip, leaving the ones named in `keep`."""
    for use in uses(text):
        name = ID_RE.search(use)
        if name and name.group(1) in PEOPLE and name.group(1) not in keep:
            text = text.replace(use, "")
    return text


def draw(rsvg: str, svg_text: str, out: Path, tmp: Path) -> None:
    tmp.write_text(svg_text, encoding="utf-8")
    subprocess.run([rsvg, "-z", "2", "-b", "none", "-o", str(out), str(tmp)], check=True)


def main() -> int:
    if len(sys.argv) < 4:
        print(__doc__, file=sys.stderr)
        return 2
    svg_root, art_dir, manifest_path = (Path(a) for a in sys.argv[1:4])
    manifest = json.loads(manifest_path.read_text())
    rooms: dict[str, object] = manifest.setdefault("rooms", {})  # type: ignore[assignment]
    # The frame labels tell us which frame of a room is which upgrade.
    labels: dict[str, dict[str, int]] = {}
    if len(sys.argv) > 4:
        labels_path = Path(sys.argv[4])
        if labels_path.exists():
            labels = json.loads(labels_path.read_text())
    rsvg = shutil.which("rsvg-convert")
    if not rsvg:
        print("rsvg-convert is needed to draw the rooms", file=sys.stderr)
        return 1
    tmp = svg_root / "_room_tmp.svg"

    for booth, entry in manifest.get("booths", {}).items():
        chid = entry["chid"]
        svg_dir = find_svg_dir(svg_root, chid)
        if not svg_dir:
            continue
        frames: list[dict[str, object]] = []
        people: dict[str, object] = {}
        for svg in sorted(svg_dir.glob("*.svg"), key=lambda p: int(p.stem)):
            n = int(svg.stem)
            text = svg.read_text(encoding="utf-8", errors="replace")
            # The room, without anyone in it.
            room_png = art_dir / f"room_{chid}_{n}.png"
            draw(rsvg, drop(text, set()), room_png, tmp)
            w, h = png_size(room_png)
            anchor = svg_anchor(svg, w, h)
            ox, oy = anchor if anchor else (w / 2, h)
            frame: dict[str, object] = {
                "file": room_png.name, "w": w, "h": h,
                "ox": round(ox, 2), "oy": round(oy, 2),
            }
            if box := png_bbox(room_png):
                frame["bbox"] = box
            for name, frame_no in labels.get(str(chid), {}).items():
                if frame_no == n:
                    frame["label"] = name
                    break
            frames.append(frame)
            # Where each person stands in the room, and what they look like.
            for use in uses(text):
                name = ID_RE.search(use)
                if not name or name.group(1) not in PEOPLE:
                    continue
                who = name.group(1)
                char = CHAR_RE.search(use)
                cls = CLASS_RE.search(use)
                if not char:
                    continue
                person_chid = int(char.group(1))
                person_dir = find_svg_dir(svg_root, person_chid)
                if not person_dir:
                    continue
                person_svg = person_dir / "1.svg"
                if not person_svg.exists():
                    continue
                # The person drawn on its own.
                person_png = art_dir / f"person_{chid}_{who}.png"
                draw(rsvg, person_svg.read_text(encoding="utf-8", errors="replace"), person_png, tmp)
                pw, ph = png_size(person_png)
                p_anchor = svg_anchor(person_svg, pw, ph)
                p_ox, p_oy = p_anchor if p_anchor else (pw / 2, ph)
                p_box = png_bbox(person_png)
                # The same person drawn inside the room.
                inside = art_dir / f"_inside_{chid}_{who}.png"
                draw(rsvg, drop(text, {who}), inside, tmp)
                i_box = png_bbox(inside)
                inside.unlink()
                if not p_box or not i_box:
                    person_png.unlink()
                    continue
                people[who] = {
                    "chid": person_chid,
                    "class": cls.group(1) if cls else "",
                    "file": person_png.name,
                    "w": pw, "h": ph,
                    "ox": round(p_ox, 2), "oy": round(p_oy, 2),
                    # How far the person sits from the room's own origin.
                    "dx": round(i_box[0] - p_box[0], 2),
                    "dy": round(i_box[1] - p_box[1], 2),
                }
        if frames:
            rooms[booth] = {"chid": chid, "frames": frames, "people": people}

    if tmp.exists():
        tmp.unlink()
    manifest_path.write_text(json.dumps(manifest, indent=1), encoding="utf-8")
    print(f"rooms: {len(rooms)}")
    for booth, entry in sorted(rooms.items()):
        people = ", ".join(sorted(entry["people"]))  # type: ignore[index]
        print(f"  {booth:16} {len(entry['frames'])} frames, people: {people}")  # type: ignore[index]
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
