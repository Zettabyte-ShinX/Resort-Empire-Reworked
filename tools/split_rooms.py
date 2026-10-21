#!/usr/bin/env python3
"""Split a facility's room art from the people standing in it.

The original draws a facility in three layers: the plot it stands on, the
floor of the room, and the room itself. The room's clip holds the furniture
of the room and the people in it together, and the original hides the people
while the room is empty, so a room with no guests shows only its furniture.

The room is therefore drawn again without the people, and each person is
drawn on its own, at the place the original puts them in the room.

Usage:
    python3 tools/split_rooms.py <svg-dir> <art-dir> <manifest>
"""

from __future__ import annotations

import json
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
from build_art_manifest import png_bbox, png_size, svg_anchor  # noqa: E402

PEOPLE = ("employee", "visitor1", "visitor2")
USE_RE = re.compile(r"<use\b[^>]*/>")
ID_RE = re.compile(r'id="([^"]+)"')
CHAR_RE = re.compile(r'ffdec:characterId="(\d+)"')
CLASS_RE = re.compile(r'ffdec:characterName="([^"]+)"')


def find_svg_dir(svg_root: Path, chid: int) -> Path | None:
    for d in sorted(svg_root.iterdir()):
        if d.is_dir() and d.name.startswith(f"DefineSprite_{chid}_"):
            return d
    return None


def drop_people(text: str, keep: set[str]) -> str:
    """Take the people out of a clip, leaving the ones named in `keep`."""
    for use in USE_RE.findall(text):
        name = ID_RE.search(use)
        if name and name.group(1) in PEOPLE and name.group(1) not in keep:
            text = text.replace(use, "")
    return text


def draw(rsvg: str, text: str, out: Path, tmp: Path) -> None:
    tmp.write_text(text, encoding="utf-8")
    subprocess.run([rsvg, "-z", "2", "-b", "none", "-o", str(out), str(tmp)], check=True)


def main() -> int:
    if len(sys.argv) != 4:
        print(__doc__, file=sys.stderr)
        return 2
    svg_root, art_dir, manifest_path = (Path(a) for a in sys.argv[1:4])
    manifest = json.loads(manifest_path.read_text())
    labels: dict[str, dict[str, int]] = {}
    labels_path = Path(__file__).parent / "swf_labels.json"
    if labels_path.exists():
        labels = json.loads(labels_path.read_text())
    rsvg = shutil.which("rsvg-convert")
    if not rsvg:
        print("rsvg-convert is needed to draw the rooms", file=sys.stderr)
        return 1

    rooms: dict[str, object] = {}
    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir) / "room.svg"
        for booth, entry in manifest.get("booths", {}).items():
            chid = entry["chid"]
            svg_dir = find_svg_dir(svg_root, chid)
            if not svg_dir:
                continue
            frames: list[dict[str, object]] = []
            people: dict[str, object] = {}
            frame_labels = labels.get(str(chid), {})
            for svg in sorted(svg_dir.glob("*.svg"), key=lambda p: int(p.stem)):
                n = int(svg.stem)
                text = svg.read_text(encoding="utf-8", errors="replace")
                # The room, with nobody in it.
                out = art_dir / f"room_{chid}_{n}.png"
                draw(rsvg, drop_people(text, set()), out, tmp)
                w, h = png_size(out)
                anchor = svg_anchor(svg, w, h)
                ox, oy = anchor if anchor else (w / 2, h)
                frame: dict[str, object] = {
                    "file": out.name, "w": w, "h": h,
                    "ox": round(ox, 2), "oy": round(oy, 2),
                }
                if box := png_bbox(out):
                    frame["bbox"] = box
                for name, frame_no in frame_labels.items():
                    if frame_no == n:
                        frame["label"] = name
                        break
                frames.append(frame)

            # Where each person stands in the room, and what they look like.
            for svg in sorted(svg_dir.glob("*.svg"), key=lambda p: int(p.stem)):
                n = int(svg.stem)
                text = svg.read_text(encoding="utf-8", errors="replace")
                for use in USE_RE.findall(text):
                    name = ID_RE.search(use)
                    if not name or name.group(1) not in PEOPLE:
                        continue
                    who = name.group(1)
                    if who in people:
                        continue
                    char = CHAR_RE.search(use)
                    if not char:
                        continue
                    person_dir = find_svg_dir(svg_root, int(char.group(1)))
                    if not person_dir or not (person_dir / "1.svg").exists():
                        continue
                    person_svg = person_dir / "1.svg"
                    person_png = art_dir / f"person_{chid}_{who}.png"
                    draw(rsvg, person_svg.read_text(encoding="utf-8", errors="replace"), person_png, tmp)
                    pw, ph = png_size(person_png)
                    p_anchor = svg_anchor(person_svg, pw, ph)
                    p_ox, p_oy = p_anchor if p_anchor else (pw / 2, ph)
                    own_box = png_bbox(person_png)
                    if not own_box:
                        person_png.unlink()
                        continue
                    # The same person, drawn inside the room.
                    inside = Path(tmpdir) / f"inside_{chid}_{who}.png"
                    draw(rsvg, drop_people(text, {who}), inside, tmp)
                    in_box = png_bbox(inside)
                    inside.unlink()
                    if not in_box:
                        person_png.unlink()
                        continue
                    # The room's own origin in its picture, and the person's
                    # origin in its own picture: the difference between where
                    # the person stands in the room and where their artwork
                    # sits in their picture is how far they have to be moved.
                    room_ox = next((f["ox"] for f in frames if f["file"].endswith(f"_{n}.png")), 0)
                    room_oy = next((f["oy"] for f in frames if f["file"].endswith(f"_{n}.png")), 0)
                    dx = (in_box[0] - own_box[0]) + (p_ox - room_ox)
                    dy = (in_box[1] - own_box[1]) + (p_oy - room_oy)
                    people[who] = {
                        "chid": int(char.group(1)),
                        "class": CLASS_RE.search(use).group(1) if CLASS_RE.search(use) else "",
                        "file": person_png.name, "w": pw, "h": ph,
                        "ox": round(p_ox, 2), "oy": round(p_oy, 2),
                        "dx": round(dx / 2, 2), "dy": round(dy / 2, 2),
                    }
            if frames:
                rooms[booth] = {"chid": chid, "frames": frames, "people": people}

    manifest["rooms"] = rooms
    manifest_path.write_text(json.dumps(manifest, indent=1), encoding="utf-8")
    print(f"rooms: {len(rooms)}")
    for booth, entry in sorted(rooms.items()):
        people = ", ".join(sorted(entry["people"]))  # type: ignore[index]
        print(f"  {booth:16} {len(entry['frames'])} frames, people: {people}")  # type: ignore[index]
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
