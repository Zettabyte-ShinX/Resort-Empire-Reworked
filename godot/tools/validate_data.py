#!/usr/bin/env python3
"""Check generated JSON data against the tables in the split notes.

The notes under resortempire-notes-split/notes are the reference. The JSON
under godot/data is the generated output. This is a build-time check only; the
game reads the JSON, never the Markdown.

Usage:
    python3 godot/tools/validate_data.py
"""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "godot" / "data"
NOTES_DIR = ROOT / "resortempire-notes-split" / "notes"


class Table:
    def __init__(self, source: Path, line: int, header: list[str], rows: list[list[str]]):
        self.source = source
        self.line = line
        self.header = header
        self.rows = rows


def cells(line: str) -> list[str]:
    line = line.strip()
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|"):
        line = line[:-1]
    return [part.strip() for part in line.split("|")]


def parse_tables(path: Path) -> list[Table]:
    lines = path.read_text(encoding="utf-8").splitlines()
    tables: list[Table] = []
    i = 0
    while i < len(lines):
        if not lines[i].startswith("|"):
            i += 1
            continue
        start = i
        header = cells(lines[i])
        i += 1
        if i >= len(lines) or not re.match(r"^\|[\s:|-]+\|?$", lines[i].strip()):
            continue
        i += 1
        rows: list[list[str]] = []
        while i < len(lines) and lines[i].startswith("|"):
            rows.append(cells(lines[i]))
            i += 1
        tables.append(Table(path, start + 1, header, rows))
    return tables


def clean(value: object) -> str:
    text = str(value).strip()
    text = text.replace("**", "").replace("`", "")
    text = text.replace("\u2019", "'").replace("\u2018", "'")
    text = text.replace("\u201c", '"').replace("\u201d", '"')
    return text.strip()


def norm_text(value: object) -> str:
    return re.sub(r"\s+", " ", clean(value)).strip()


def norm_name(value: object) -> str:
    """Compare display names without case, spaces or punctuation."""
    return re.sub(r"[^a-z0-9]", "", clean(value).casefold())


def money(value: object) -> int | float:
    text = clean(value).replace("$", "").replace(",", "").strip()
    if not text:
        return 0
    number = float(text)
    return int(number) if number.is_integer() else number


def number(value: object) -> float:
    return float(clean(value).replace(",", ""))


def money_list(value: object) -> list[int | float]:
    return [money(part) for part in clean(value).split("/")]


def parse_range(value: object) -> tuple[float, float]:
    match = re.search(r"([\d.]+)\s*[\u2013-]\s*([\d.]+)", clean(value))
    if not match:
        raise ValueError(f"not a range: {value!r}")
    return float(match.group(1)), float(match.group(2))


def parse_size(value: object) -> tuple[int, int]:
    match = re.search(r"(\d+)\s*\u00d7\s*(\d+)", clean(value))
    if not match:
        raise ValueError(f"not a size: {value!r}")
    return int(match.group(1)), int(match.group(2))


def parse_hours(value: object) -> tuple[int, int]:
    text = clean(value)
    if text == "24 h":
        return 0, 0
    match = re.search(r"(\d{1,2}):(\d{2})\s*[\u2013-]\s*(\d{1,2}):(\d{2})", text)
    if not match:
        raise ValueError(f"not a time range: {value!r}")
    return int(match.group(1)), int(match.group(3))


def parse_pop(value: object) -> tuple[float, float, float | None, float | None]:
    match = re.search(
        r"([\d.]+)\s*[\u2013-]\s*([\d.]+)"
        r"(?:\s*\(\+([\d.]+)\s*/\s*\+([\d.]+)\))?",
        clean(value),
    )
    if not match:
        raise ValueError(f"not a popularity range: {value!r}")
    low = float(match.group(1))
    high = float(match.group(2))
    level2 = float(match.group(3)) if match.group(3) else None
    level3 = float(match.group(4)) if match.group(4) else None
    return low, high, level2, level3


class Checker:
    def __init__(self) -> None:
        self.checks = 0
        self.failures: list[str] = []

    def eq(self, label: str, got: object, want: object) -> None:
        self.checks += 1
        if got != want:
            self.failures.append(f"{label}: json={got!r} notes={want!r}")

    def close(self, label: str, got: object, want: object) -> None:
        self.checks += 1
        if abs(float(got) - float(want)) > 1e-9:
            self.failures.append(f"{label}: json={got!r} notes={want!r}")

    def truth(self, label: str, condition: bool, detail: str = "") -> None:
        self.checks += 1
        if not condition:
            self.failures.append(label + (f": {detail}" if detail else ""))


def find_table(tables: list[Table], prefix: list[str]) -> Table:
    cleaned = [clean(cell) for cell in prefix]
    for table in tables:
        header = [clean(cell) for cell in table.header[: len(cleaned)]]
        if header == cleaned:
            return table
    raise RuntimeError("table not found: " + " | ".join(cleaned))


def load(name: str) -> dict:
    path = DATA_DIR / name
    if not path.exists():
        raise RuntimeError(f"missing generated data: {path}")
    return json.loads(path.read_text(encoding="utf-8"))


def validate_booths(check: Checker, tables: list[Table], data: dict, extras: dict, unlocked: dict) -> None:
    table = find_table(
        tables, ["Type", "Display name", "Size", "Build $ (L1/L2/L3)"]
    )
    check.eq("booths: table row count", len(table.rows), 21)
    check.eq("booths: generated count", len(data["booths"]), 21)
    extra_map = {key: value["unlocked"] for key, value in extras["extras"].items()}

    for row in table.rows:
        key = clean(row[0])
        booth = data["booths"].get(key)
        check.truth(f"booths[{key}]: exists", booth is not None)
        if booth is None:
            continue
        label = f"booths[{key}]"
        check.eq(f"{label}.nama", norm_name(booth["nama"]), norm_name(row[1]))

        cols, rows = parse_size(row[2])
        check.eq(f"{label}.COLS", booth["COLS"], cols)
        check.eq(f"{label}.ROWS", booth["ROWS"], rows)

        check.eq(f"{label}.price", booth["price"], money_list(row[3]))

        fee = clean(row[4])
        booked = booth.get("booked_price", 0)
        if fee == "\u2014":
            check.eq(f"{label}.booked_price", booked, 0)
        elif "night" in fee:
            check.eq(f"{label}.booked_price", booked, money_list(fee.replace("/ night", "")))
        elif "random" in fee:
            body = fee.replace("(random)", "").strip()
            if "/" in body:
                ranges = [parse_range(part) for part in body.split("/")]
                check.eq(
                    f"{label}.booked_price max",
                    booked,
                    [high for _, high in ranges],
                )
                check.eq(
                    f"{label}.booked_price min",
                    [level + 4 for level in range(1, 4)],
                    [low for low, _ in ranges],
                )
            else:
                low, high = parse_range(body)
                check.eq(f"{label}.booked_price[0]", booked[0], low)
                check.eq(f"{label}.booked_price[1]", booked[1], high)
        else:
            check.eq(f"{label}.booked_price", booked, money_list(fee))

        opened, closed = parse_hours(row[5])
        check.eq(f"{label}.opened", booth.get("opened", 0), opened)
        check.eq(f"{label}.closed", booth.get("closed", 0), closed)

        check.eq(f"{label}.xpt", booth["xpt"], int(clean(row[6])))

        salary = clean(row[7])
        if salary == "\u2014":
            check.eq(f"{label}.salary total", sum(booth.get("salary", [0])), 0)
        else:
            staff = booth.get("sumStaff", 0)
            expected = [value * staff for value in booth.get("salary", [])]
            check.eq(f"{label}.salary", expected, money_list(salary))

        low, high, level2, level3 = parse_pop(row[8])
        check.close(f"{label}.pop min", booth["pop"][3], low)
        check.close(f"{label}.pop max", booth["pop"][0], high)
        if level2 is not None:
            check.close(f"{label}.pop L2", booth["pop"][1], level2)
        if level3 is not None:
            check.close(f"{label}.pop L3", booth["pop"][2], level3)

        unlock = clean(row[9])
        if unlock == "start":
            if key == "Lobby":
                check.truth(f"{label}.unlock start", True)
            else:
                check.truth(
                    f"{label}.unlock start",
                    key in unlocked["level_0"],
                    f"not in level_0: {unlocked['level_0']}",
                )
        elif unlock.startswith("star "):
            level = unlock.split(" ", 1)[1]
            check.truth(
                f"{label}.unlock star {level}",
                key in unlocked.get(f"level_{level}", []),
                f"not in level_{level}",
            )
        else:
            check.eq(f"{label}.unlock", extra_map.get(unlock), key)


def validate_visitors(check: Checker, tables: list[Table], data: dict) -> None:
    table = find_table(
        tables, ["#", "Name", "Sex", "Cash", "Max nights"]
    )
    check.eq("visitors: table row count", len(table.rows), 29)
    check.eq("visitors: generated count", len(data["visitors"]), 29)
    sex_names = {0: "M", 1: "F", 3: "couple"}

    for row in table.rows:
        n = int(clean(row[0]))
        key = f"Visitor{n}"
        visitor = data["visitors"].get(key)
        check.truth(f"visitors[{key}]: exists", visitor is not None)
        if visitor is None:
            continue
        label = f"visitors[{key}]"
        expected_name = visitor.get("nick", f"Visitor {n}")
        check.eq(f"{label}.name", norm_name(expected_name), norm_name(row[1]))
        check.eq(f"{label}.sex", sex_names[visitor["sex"]], clean(row[2]))
        check.eq(f"{label}.cash", visitor["money"], money(row[3]))
        check.eq(f"{label}.room_stay", visitor["room_stay"], int(clean(row[4])))
        check.eq(f"{label}.tip", visitor["tip"], int(clean(row[5])))
        check.eq(f"{label}.hygiene", visitor["hygiene"], int(clean(row[6])))
        check.close(f"{label}.speed", visitor["speed"], number(row[7]))
        check.eq(
            f"{label}.medical_prob",
            visitor["medical_prob"],
            int(clean(row[8]).replace("%", "")),
        )
        check.eq(f"{label}.old", visitor["old"], clean(row[9]) == "yes")
        check.eq(f"{label}.jenis", visitor["jenis"], n)


def validate_scenery(check: Checker, tables: list[Table], data: dict) -> None:
    table = find_table(tables, ["ID", "Name", "Price", "Popularity", "Unlock star"])
    check.eq("scenery: table row count", len(table.rows), 8)
    check.eq("scenery: order", data["order"], [f"PLANT_{n}" for n in range(1, 9)])

    for row in table.rows:
        key = f"PLANT_{int(clean(row[0]))}"
        item = data["items"].get(key)
        check.truth(f"scenery[{key}]: exists", item is not None)
        if item is None:
            continue
        label = f"scenery[{key}]"
        check.eq(f"{label}.nama", norm_name(item["nama"]), norm_name(row[1]))
        check.eq(f"{label}.price", item["price"], money(row[2]))
        check.close(f"{label}.pop", item["pop"], number(row[3]))
        check.eq(f"{label}.unlocked_level", item["unlocked_level"], int(clean(row[4])))
        check.eq(
            f"{label}.unlocked_persen",
            item["unlocked_persen"],
            number(clean(row[5]).replace("%", "")),
        )


def expand_tile_ids(value: object) -> list[int]:
    text = clean(value)
    match = re.search(
        r"TILE_(\d+)\s*[\u2013-]\s*TILE_(\d+)", text
    )
    if match:
        start, end = int(match.group(1)), int(match.group(2))
        return list(range(start, end + 1))
    match = re.search(r"TILE_(\d+)", text)
    if not match:
        raise ValueError(f"not a tile id: {value!r}")
    return [int(match.group(1))]


def validate_tiles(check: Checker, tables: list[Table], data: dict) -> None:
    table = find_table(
        tables, ["ID", "Name", "Price", "Popularity", "Walkable", "Plantable"]
    )
    for row in table.rows:
        for tile_id in expand_tile_ids(row[0]):
            key = f"TILE_{tile_id}"
            item = data["items"].get(key)
            check.truth(f"tiles[{key}]: exists", item is not None)
            if item is None:
                continue
            label = f"tiles[{key}]"
            check.eq(f"{label}.price", item["price"], money(row[2]))
            check.close(f"{label}.pop", item["pop"], number(row[3]))
            check.eq(f"{label}.walkable", item["walkable"], clean(row[4]) == "yes")
            check.eq(f"{label}.plenty", item["plenty"], clean(row[5]) == "yes")


def validate_extras(check: Checker, tables: list[Table], data: dict) -> None:
    table = find_table(tables, ["Key", "Name", "Effect", "Unlocks", "Price", "Star"])
    check.eq("extras: table row count", len(table.rows), 15)
    check.eq("extras: generated count", len(data["extras"]), 15)
    check.eq("extras: order", data["order"], [clean(row[0]) for row in table.rows])

    for row in table.rows:
        key = clean(row[0])
        item = data["extras"].get(key)
        check.truth(f"extras[{key}]: exists", item is not None)
        if item is None:
            continue
        label = f"extras[{key}]"
        check.eq(f"{label}.name", norm_name(item["name"]), norm_name(row[1]))
        check.eq(f"{label}.unlocked", clean(item["unlocked"]), clean(row[3]))
        check.eq(f"{label}.price", item["price"], money(row[4]))
        check.eq(f"{label}.need_star", item["need_star"], int(clean(row[5])))
        level = str(item["need_star"])
        check.truth(
            f"{label}.level_{level} membership",
            key in data["levels"].get(level, []),
            f"not in level_{level}",
        )


def validate_achievements(check: Checker, tables: list[Table], data: dict) -> None:
    table = find_table(tables, ["Key", "Name", "Description", "Bonus", "RP"])
    check.eq("achievements: table row count", len(table.rows), 15)
    check.eq("achievements: generated count", len(data["achievements"]), 15)
    check.eq(
        "achievements: order",
        data["order"],
        [clean(row[0]) for row in table.rows],
    )

    for row in table.rows:
        key = clean(row[0])
        item = data["achievements"].get(key)
        check.truth(f"achievements[{key}]: exists", item is not None)
        if item is None:
            continue
        label = f"achievements[{key}]"
        check.eq(f"{label}.nama", norm_name(item["nama"]), norm_name(row[1]))
        check.eq(f"{label}.desc", norm_text(item["desc"]), norm_text(row[2]))
        check.eq(f"{label}.bonus", item["bonus"], money(row[3]))
        check.eq(f"{label}.RP", item["RP"], int(clean(row[4])))


def validate_missions(check: Checker, tables: list[Table], data: dict) -> None:
    table = find_table(tables, ["#", "Key", "Description", "Target", "Reward"])
    check.eq("missions: table row count", len(table.rows), 94)
    check.eq("missions: generated count", len(data["missions"]), 94)
    check.eq("missions: order", data["order"], [clean(row[1]) for row in table.rows])

    for row in table.rows:
        key = clean(row[1])
        item = data["missions"].get(key)
        check.truth(f"missions[{key}]: exists", item is not None)
        if item is None:
            continue
        label = f"missions[{key}]"
        check.eq(f"{label}.desc", norm_text(item["desc"]), norm_text(row[2]))
        target = clean(row[3])
        expected_target = 0 if target == "\u2014" else int(target.replace("\u2264", "").strip())
        check.eq(f"{label}.batas", item["batas"], expected_target)
        check.eq(f"{label}.bonus", item["bonus"], money(row[4]))


def main() -> int:
    if not NOTES_DIR.exists():
        print(f"error: notes folder not found: {NOTES_DIR}", file=sys.stderr)
        return 1
    tables: list[Table] = []
    for path in sorted(NOTES_DIR.glob("*.md")):
        tables.extend(parse_tables(path))

    check = Checker()
    try:
        booths = load("booths.json")
        visitors = load("visitors.json")
        missions = load("missions.json")
        achievements = load("achievements.json")
        extras = load("extras.json")
        scenery = load("scenery.json")
        tiles = load("tiles.json")
    except (RuntimeError, json.JSONDecodeError) as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1

    validate_booths(check, tables, booths, extras, booths["unlocked"])
    validate_visitors(check, tables, visitors)
    validate_scenery(check, tables, scenery)
    validate_tiles(check, tables, tiles)
    validate_extras(check, tables, extras)
    validate_achievements(check, tables, achievements)
    validate_missions(check, tables, missions)

    if check.failures:
        print(f"FAILED: {len(check.failures)} of {check.checks} checks")
        for failure in check.failures:
            print(f"  - {failure}")
        return 1

    print(f"OK: {check.checks} checks passed")
    print(
        "  booths 21, visitors 29, missions 94, achievements 15, "
        "extras 15, scenery 8 buyable, tiles 15 shop/default checked"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
