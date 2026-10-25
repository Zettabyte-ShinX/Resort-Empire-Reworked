#!/usr/bin/env python3
"""Generate godot/data/*.json from the decompiled AS3 content tables.

The only input is exports/scripts/pack/serbi.as. The parser understands the
small AS3 subset used by that file before the class constructor:

    path.to.object = { "key": value, ... };
    path.to.object["dynamic key"] = [...];
    new Point(x, y)

Function calls and assignments that depend on them (for example
``canceledMood(...)`` and ``otherFacility(...)``) are not evaluated by the
parser. The two that affect exported data are reproduced explicitly below and
listed in ``_derived`` so the output is transparent.

Usage:
    python3 godot/tools/generate_data.py
"""

from __future__ import annotations

import copy
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / "exports" / "scripts" / "pack" / "serbi.as"
OUT_DIR = ROOT / "godot" / "data"

ROOTS = {
    "dataOb",
    "Mission",
    "Achievements",
    "Extra_Upgrade",
    "Unlocked",
    "ResearchPoint",
    "Tips",
}


class ParseError(Exception):
    pass


class SkipAssignment(Exception):
    pass


# ---------------------------------------------------------------------------
# Tokenizer

class Token:
    __slots__ = ("kind", "value", "pos")

    def __init__(self, kind: str, value, pos: int) -> None:
        self.kind = kind
        self.value = value
        self.pos = pos

    def __repr__(self) -> str:  # pragma: no cover - debugging aid
        return f"Token({self.kind!r}, {self.value!r})"


ESCAPES = {
    "n": "\n",
    "r": "\r",
    "t": "\t",
    "b": "\b",
    "f": "\f",
    "v": "\v",
    "0": "\0",
    "'": "'",
    '"': '"',
    "\\": "\\",
    "/": "/",
}


def tokenize(text: str) -> list[Token]:
    tokens: list[Token] = []
    i = 0
    n = len(text)
    while i < n:
        ch = text[i]
        if ch in " \t\r\n":
            i += 1
        elif ch == "/" and i + 1 < n and text[i + 1] == "/":
            i = text.find("\n", i + 2)
            if i == -1:
                break
        elif ch == "/" and i + 1 < n and text[i + 1] == "*":
            end = text.find("*/", i + 2)
            if end == -1:
                raise ParseError(f"unterminated block comment at {i}")
            i = end + 2
        elif ch in "\"'":
            quote = ch
            start = i
            i += 1
            buf: list[str] = []
            while i < n:
                ch = text[i]
                if ch == "\\":
                    i += 1
                    if i >= n:
                        raise ParseError(f"unterminated escape at {start}")
                    esc = text[i]
                    if esc == "u":
                        hex_digits = text[i + 1 : i + 5]
                        if len(hex_digits) != 4 or not re.fullmatch(
                            r"[0-9a-fA-F]{4}", hex_digits
                        ):
                            raise ParseError(f"invalid unicode escape at {i}")
                        buf.append(chr(int(hex_digits, 16)))
                        i += 5
                    else:
                        buf.append(ESCAPES.get(esc, esc))
                        i += 1
                elif ch == quote:
                    i += 1
                    break
                else:
                    buf.append(ch)
                    i += 1
            else:
                raise ParseError(f"unterminated string at {start}")
            tokens.append(Token("string", "".join(buf), start))
        elif ch.isdigit() or (ch == "." and i + 1 < n and text[i + 1].isdigit()):
            match = re.match(r"\d+(?:\.\d+)?(?:[eE][+-]?\d+)?", text[i:])
            assert match is not None
            raw = match.group(0)
            value = float(raw) if ("." in raw or "e" in raw.lower()) else int(raw)
            tokens.append(Token("number", value, i))
            i += len(raw)
        elif ch.isalpha() or ch in "_$":
            match = re.match(r"[A-Za-z_$][A-Za-z0-9_$]*", text[i:])
            assert match is not None
            raw = match.group(0)
            tokens.append(Token("ident", raw, i))
            i += len(raw)
        elif ch in "{}[]():,;=.+-":
            tokens.append(Token("punct", ch, i))
            i += 1
        else:
            raise ParseError(f"unexpected character {ch!r} at {i}")
    return tokens


def split_statements(tokens: list[Token]) -> list[list[Token]]:
    statements: list[list[Token]] = []
    current: list[Token] = []
    for token in tokens:
        if token.kind == "punct" and token.value == ";":
            if current:
                statements.append(current)
            current = []
        else:
            current.append(token)
    if current:
        statements.append(current)
    return statements


# ---------------------------------------------------------------------------
# Value parser


def parse_path(tokens: list[Token], index: int) -> tuple[list[object], int]:
    if index >= len(tokens) or tokens[index].kind != "ident":
        raise ParseError("expected identifier")
    path: list[object] = [tokens[index].value]
    index += 1
    while index < len(tokens):
        token = tokens[index]
        if token.kind == "punct" and token.value == ".":
            index += 1
            if index >= len(tokens) or tokens[index].kind != "ident":
                raise ParseError("expected identifier after dot")
            path.append(tokens[index].value)
            index += 1
        elif token.kind == "punct" and token.value == "[":
            index += 1
            if index >= len(tokens):
                raise ParseError("unterminated index")
            key_token = tokens[index]
            if key_token.kind == "string":
                path.append(key_token.value)
            elif key_token.kind == "number":
                path.append(int(key_token.value))
            else:
                raise ParseError("unsupported index key")
            index += 1
            if (
                index >= len(tokens)
                or tokens[index].kind != "punct"
                or tokens[index].value != "]"
            ):
                raise ParseError("expected ]")
            index += 1
        else:
            break
    return path, index


def resolve_reference(root: dict, path: list[str]):
    current = root
    for part in path:
        if not isinstance(current, dict) or part not in current:
            raise ParseError("unresolved reference: " + ".".join(path))
        current = current[part]
    return copy.deepcopy(current)


def parse_value(
    tokens: list[Token], index: int, root: dict
) -> tuple[object, int]:
    if index >= len(tokens):
        raise ParseError("expected value")
    token = tokens[index]

    if token.kind == "string" or token.kind == "number":
        return token.value, index + 1

    if token.kind == "punct" and token.value in "+-":
        sign = -1 if token.value == "-" else 1
        value, index = parse_value(tokens, index + 1, root)
        if not isinstance(value, (int, float)):
            raise ParseError("unary sign applied to non-number")
        return sign * value, index

    if token.kind == "punct" and token.value == "{":
        result: dict[str, object] = {}
        index += 1
        while True:
            if index >= len(tokens):
                raise ParseError("unterminated object")
            if tokens[index].kind == "punct" and tokens[index].value == "}":
                return result, index + 1
            key_token = tokens[index]
            if key_token.kind in ("string", "ident"):
                key = str(key_token.value)
            elif key_token.kind == "number":
                key = str(key_token.value)
            else:
                raise ParseError("invalid object key")
            index += 1
            if (
                index >= len(tokens)
                or tokens[index].kind != "punct"
                or tokens[index].value != ":"
            ):
                raise ParseError("expected : in object")
            value, index = parse_value(tokens, index + 1, root)
            result[key] = value
            if index >= len(tokens):
                raise ParseError("unterminated object")
            if tokens[index].kind == "punct" and tokens[index].value == ",":
                index += 1
                continue
            if tokens[index].kind == "punct" and tokens[index].value == "}":
                return result, index + 1
            raise ParseError("expected , or } in object")

    if token.kind == "punct" and token.value == "[":
        result_list: list[object] = []
        index += 1
        while True:
            if index >= len(tokens):
                raise ParseError("unterminated array")
            if tokens[index].kind == "punct" and tokens[index].value == "]":
                return result_list, index + 1
            value, index = parse_value(tokens, index, root)
            result_list.append(value)
            if index >= len(tokens):
                raise ParseError("unterminated array")
            if tokens[index].kind == "punct" and tokens[index].value == ",":
                index += 1
                continue
            if tokens[index].kind == "punct" and tokens[index].value == "]":
                return result_list, index + 1
            raise ParseError("expected , or ] in array")

    if token.kind == "ident":
        if token.value == "true":
            return True, index + 1
        if token.value == "false":
            return False, index + 1
        if token.value == "null":
            return None, index + 1
        if token.value == "undefined":
            return None, index + 1
        if token.value == "new":
            index += 1
            if index >= len(tokens) or tokens[index].kind != "ident":
                raise ParseError("expected class after new")
            class_name = tokens[index].value
            index += 1
            if class_name == "Point":
                if (
                    index >= len(tokens)
                    or tokens[index].kind != "punct"
                    or tokens[index].value != "("
                ):
                    raise ParseError("expected ( after new Point")
                x, index = parse_value(tokens, index + 1, root)
                if (
                    index >= len(tokens)
                    or tokens[index].kind != "punct"
                    or tokens[index].value != ","
                ):
                    raise ParseError("expected , in new Point")
                y, index = parse_value(tokens, index + 1, root)
                if (
                    index >= len(tokens)
                    or tokens[index].kind != "punct"
                    or tokens[index].value != ")"
                ):
                    raise ParseError("expected ) after new Point")
                return {"x": x, "y": y}, index + 1
            raise ParseError(f"unsupported new {class_name}()")

        path, index = parse_path(tokens, index)
        if index < len(tokens) and tokens[index].kind == "punct" and tokens[index].value == "(":
            raise ParseError("function call")
        return resolve_reference(root, [str(part) for part in path]), index

    raise ParseError(f"unsupported value token {token!r}")


def set_path(container, path: list[object], value):
    """Set a value, converting a list to a dict when AS3 uses a string key.

    serbi uses empty arrays as associative containers (HYGIENE_RANGE,
    usedTimer, ResearchPoint.addPoint). The JSON equivalent is an object.
    """
    key = path[0]
    if len(path) == 1:
        if isinstance(container, list):
            if isinstance(key, int):
                while len(container) <= key:
                    container.append(None)
                container[key] = value
                return container
            converted = {str(index): item for index, item in enumerate(container)}
            converted[str(key)] = value
            return converted
        if isinstance(container, dict):
            container[key] = value
            return container
        raise SkipAssignment

    if isinstance(container, list):
        if not isinstance(key, int):
            raise SkipAssignment
        while len(container) <= key:
            container.append(None)
        child = container[key]
    elif isinstance(container, dict):
        child = container.get(key)
        if child is None:
            child = {}
            container[key] = child
    else:
        raise SkipAssignment

    new_child = set_path(child, path[1:], value)
    if new_child is not child:
        if isinstance(container, list):
            container[key] = new_child
        else:
            container[key] = new_child
    return container


def assign(root: dict, path: list[object], value) -> None:
    set_path(root, path, value)


def parse_serbi(path: Path) -> tuple[dict, list[str]]:
    text = path.read_text(encoding="utf-8")
    marker = text.find("public function serbi")
    if marker == -1:
        raise ParseError("could not find the serbi constructor")
    tokens = tokenize(text[:marker])
    statements = split_statements(tokens)
    root: dict = {}
    skipped: list[str] = []

    for statement in statements:
        equals = None
        for i, token in enumerate(statement):
            if token.kind == "punct" and token.value == "=":
                equals = i
                break
        if equals is None:
            continue
        left = statement[:equals]
        right = statement[equals + 1 :]
        if not left or left[0].kind != "ident" or left[0].value not in ROOTS:
            continue
        try:
            path, consumed = parse_path(left, 0)
            if consumed != len(left):
                raise SkipAssignment
            value, consumed = parse_value(right, 0, root)
            if consumed != len(right):
                raise SkipAssignment
            assign(root, path, value)
        except SkipAssignment:
            snippet = " ".join(str(t.value) for t in statement)[:160]
            skipped.append(snippet)
        except ParseError as exc:
            if "function call" in str(exc):
                snippet = " ".join(str(t.value) for t in statement)[:160]
                skipped.append(snippet)
                continue
            raise
    return root, skipped


# ---------------------------------------------------------------------------
# Post-processing


def derive_booth_canceled(booths: dict[str, dict]) -> None:
    """Reproduce canceledMood() calls that follow the booth literals."""
    for key, booth in booths.items():
        boost = booth.get("boostMood")
        if not isinstance(boost, dict):
            continue
        served = boost.get("served")
        if not isinstance(served, list) or not served:
            continue
        if boost.get("canceled"):
            continue
        if key == "Lobby":
            boost["canceled"] = [[value / 2, value / 2] for value in served]
        else:
            boost["canceled"] = [
                [pair[0] / 4, pair[1] / 4] for pair in served
            ]


def other_facility(listing: list[str], argument: list) -> list[str]:
    """Reproduce otherFacility() for every visitor variant."""
    remaining = list(listing)
    for item in argument:
        if isinstance(item, str) and item in remaining:
            remaining.remove(item)
    return remaining


def derive_visitor_other(visitors: dict[str, dict], listing: list[str]) -> None:
    for key, visitor in visitors.items():
        match = re.fullmatch(r"Visitor(\d+)", key)
        if not match:
            continue
        number = int(match.group(1))
        facility = visitor.get("likes", {}).get("Facility")
        if not isinstance(facility, list):
            continue
        # Only Visitor1 passes the names array (Facility[0]); every other
        # visitor passes the whole [names, weights] pair. otherFacility() then
        # finds no matching strings, so those visitors fall back to the full
        # facility list. That is an original quirk; preserve it exactly.
        argument = facility[0] if number == 1 else facility
        visitor["Other"] = other_facility(listing, argument)


# ---------------------------------------------------------------------------
# Writers


def dump(name: str, payload: dict) -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    target = OUT_DIR / name
    text = json.dumps(payload, ensure_ascii=False, indent=2)
    target.write_text(text + "\n", encoding="utf-8")


def main() -> int:
    if not SOURCE.exists():
        print(f"error: source not found: {SOURCE}", file=sys.stderr)
        return 1

    root, skipped = parse_serbi(SOURCE)
    source_label = str(SOURCE.relative_to(ROOT))

    try:
        data_ob = root["dataOb"]
        booth_data = data_ob["Booth"]
        visitor_data = data_ob["Visitor"]
        scenery_data = data_ob["Scenery"]
        tile_data = data_ob["Tile"]
        mission_data = root["Mission"]
        achievements_data = root["Achievements"]
        extras_data = root["Extra_Upgrade"]
        unlocked_data = root["Unlocked"]
    except KeyError as exc:
        print(f"error: missing parsed root {exc}", file=sys.stderr)
        return 1

    booths = {
        key: value
        for key, value in booth_data.items()
        if key != "boostMood" and isinstance(value, dict)
    }
    derive_booth_canceled(booths)

    visitors = {
        key: value
        for key, value in visitor_data.items()
        if re.fullmatch(r"Visitor\d+", key) and isinstance(value, dict)
    }
    listing = data_ob["listing"]
    derive_visitor_other(visitors, listing)

    missions = {
        key: value
        for key, value in mission_data.items()
        if key != "listing" and isinstance(value, dict)
    }
    mission_order = mission_data["listing"]

    achievements = {
        key: value
        for key, value in achievements_data.items()
        if isinstance(value, dict)
    }

    extras = {
        key: value
        for key, value in extras_data.items()
        if key != "listing"
        and not key.startswith("level_")
        and isinstance(value, dict)
    }
    extra_order = extras_data["listing"]
    extra_levels = {
        str(level): extras_data[f"level_{level}"]
        for level in range(1, 11)
        if f"level_{level}" in extras_data
    }

    scenery_items = {
        key: value
        for key, value in scenery_data.items()
        if isinstance(value, dict)
    }
    scenery_order = scenery_data["listing"]

    tile_items = {
        key: value
        for key, value in tile_data.items()
        if isinstance(value, dict)
    }
    tile_order = sorted(
        tile_items,
        key=lambda key: int(re.search(r"(\d+)$", key).group(1)),
    )

    visitor_rules = {
        key: value
        for key, value in visitor_data.items()
        if not re.fullmatch(r"Visitor\d+", key)
    }

    meta = {
        "_source": source_label,
        "_generator": "godot/tools/generate_data.py",
        "_derived": [
            "booths.*.boostMood.canceled (canceledMood calls)",
            "visitors.*.Other (otherFacility calls)",
        ],
    }

    dump(
        "booths.json",
        {
            **meta,
            "order": list(booths.keys()),
            "booths": booths,
            "useTimers": data_ob.get("usedTimer", {}),
            "unlocked": unlocked_data,
        },
    )
    dump(
        "visitors.json",
        {
            **meta,
            "order": list(visitors.keys()),
            "visitors": visitors,
            "rules": visitor_rules,
            "timers": {
                "jamTidur": data_ob.get("jamTidur"),
                "istirahatTimer": data_ob.get("istirahatTimer"),
                "jamBangun": data_ob.get("jamBangun"),
            },
            "caps": data_ob.get("MaximumPembanding"),
        },
    )
    dump(
        "missions.json",
        {
            **meta,
            "order": mission_order,
            "missions": missions,
        },
    )
    dump(
        "achievements.json",
        {
            **meta,
            "order": list(achievements.keys()),
            "achievements": achievements,
        },
    )
    dump(
        "extras.json",
        {
            **meta,
            "order": extra_order,
            "extras": extras,
            "levels": extra_levels,
        },
    )
    dump(
        "scenery.json",
        {
            **meta,
            "order": scenery_order,
            "items": scenery_items,
        },
    )
    dump(
        "tiles.json",
        {
            **meta,
            "order": tile_order,
            "items": tile_items,
        },
    )

    counts = {
        "booths": len(booths),
        "visitors": len(visitors),
        "missions": len(missions),
        "mission_order": len(mission_order),
        "achievements": len(achievements),
        "extras": len(extras),
        "scenery": len(scenery_items),
        "tiles": len(tile_items),
    }
    print(
        "Generated "
        + ", ".join(f"{value} {name}" for name, value in counts.items())
    )
    if skipped:
        print(
            f"Parser skipped {len(skipped)} assignments outside the exported "
            "groups or handled by explicit derivation rules."
        )

    expected = {
        "booths": 21,
        "visitors": 29,
        "missions": 94,
        "mission_order": 94,
        "achievements": 15,
        "extras": 15,
        "scenery": 19,
        "tiles": 26,
    }
    problems = [
        f"{name}: expected {want}, got {counts[name]}"
        for name, want in expected.items()
        if counts[name] != want
    ]
    if problems:
        for problem in problems:
            print(f"error: {problem}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
