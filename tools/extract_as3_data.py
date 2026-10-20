#!/usr/bin/env python3
"""
Extract the Resort Empire balance/content data tables from the decompiled
ActionScript 3 sources into a single JSON file.

The decompiled sources come from the SWF embedded in `Resort Empire.exe`.
Extract it with JPEXS ffdec:

    ffdec -export script  <outdir>  ResortEmpire.swf

then point this tool at the resulting `pack/serbi.as`.

Usage:
    python3 tools/extract_as3_data.py <path-to>/pack/serbi.as > src/core/data.json
"""

from __future__ import annotations

import json
import re
import sys
from typing import Any

IDENT = re.compile(r"[A-Za-z_]\w*")
TARGET = re.compile(r"[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*(?:\[\"[^\"]+\"\])?")


class Parser:
    """Recursive-descent parser for the AS3 literal subset."""

    def __init__(self, src: str, pos: int = 0) -> None:
        self.s = src
        self.i = pos

    def ws(self) -> None:
        while self.i < len(self.s):
            c = self.s[self.i]
            if c in " \t\r\n":
                self.i += 1
            elif self.s.startswith("//", self.i):
                end = self.s.find("\n", self.i)
                self.i = len(self.s) if end == -1 else end + 1
            elif self.s.startswith("/*", self.i):
                end = self.s.find("*/", self.i)
                self.i = len(self.s) if end == -1 else end + 2
            else:
                return

    def value(self) -> Any:
        self.ws()
        c = self.s[self.i]
        if c == "{":
            return self.obj()
        if c == "[":
            return self.arr()
        if c in "\"'":
            return self.string()
        return self.primitive()

    def string(self) -> str:
        quote = self.s[self.i]
        self.i += 1
        out = []
        while self.i < len(self.s):
            c = self.s[self.i]
            if c == "\\":
                self.i += 1
                out.append(self.s[self.i])
            elif c == quote:
                self.i += 1
                break
            else:
                out.append(c)
            self.i += 1
        return "".join(out)

    def primitive(self) -> Any:
        # `new Point(x, y)` and friends: capture the constructor arguments.
        new = re.match(r"new\s+([A-Za-z_]\w*)\s*\(", self.s[self.i:])
        if new:
            self.i += new.end()   # now sitting on '('
            self.i += 1           # consume '('
            depth = 1
            start = self.i
            while self.i < len(self.s):
                if self.s[self.i] == "(":
                    depth += 1
                elif self.s[self.i] == ")":
                    depth -= 1
                    if depth == 0:
                        break
                self.i += 1
            inner = self.s[start:self.i]
            self.i += 1  # consume ')'
            for part in inner.split(","):
                part = part.strip()
                if part:
                    try:
                        args.append(Parser(part).value())
                    except Exception:
                        args.append(part)
            if new.group(1) == "Point" and len(args) == 2:
                return {"x": args[0], "y": args[1]}
            return {"__ctor": new.group(1), "args": args}

        m = re.match(
            r"(true|false|null|undefined|NaN|-?\d+\.?\d*(?:[eE][-+]?\d+)?)",
            self.s[self.i:],
        )
        if not m:
            raise ValueError(f"cannot parse primitive at {self.s[self.i:self.i + 40]!r}")
        tok = m.group(1)
        self.i += len(tok)
        if tok == "true":
            return True
        if tok == "false":
            return False
        if tok in ("null", "undefined"):
            return None
        if tok == "NaN":
            return float("nan")
        return float(tok) if any(c in tok for c in ".eE") else int(tok)

    def arr(self) -> list:
        self.i += 1  # consume '['
        out = []
        while True:
            self.ws()
            if self.s[self.i] == "]":
                self.i += 1
                return out
            out.append(self.value())
            self.ws()
            if self.s[self.i] == ",":
                self.i += 1
            elif self.s[self.i] == "]":
                self.i += 1
                return out

    def obj(self) -> dict:
        self.i += 1  # consume '{'
        out = {}
        while True:
            self.ws()
            if self.s[self.i] == "}":
                self.i += 1
                return out
            key = self.string()
            self.ws()
            if self.s[self.i] != ":":
                raise ValueError(f"expected ':' at {self.s[self.i:self.i + 40]!r}")
            self.i += 1
            out[key] = self.value()
            self.ws()
            if self.s[self.i] == ",":
                self.i += 1
            elif self.s[self.i] == "}":
                self.i += 1
                return out


def scan_target(src: str, j: int) -> tuple[list[str], int] | None:
    """Scan backwards from index `j` for an assignment target.

    Returns `(parts, start_index)` where `parts` is the target split into
    path components, e.g. `dataOb.Booth` -> `['dataOb', 'Booth']` and
    `EXPAND["price"]` -> `['EXPAND', 'price']`.
    """
    i = j
    parts: list[str] = []

    while True:
        if src[i] == "]":
            depth = 0
            k = i
            while k >= 0:
                if src[k] == "]":
                    depth += 1
                elif src[k] == "[":
                    depth -= 1
                    if depth == 0:
                        break
                k -= 1
            if k < 0:
                return None
            parts.append(src[k + 1:i].strip('"'))
            i = k - 1
            while i >= 0 and src[i] in " \t\r\n":
                i -= 1
            if i < 0:
                return None

        end = i
        while i >= 0 and (src[i].isalnum() or src[i] == "_"):
            i -= 1
        if end == i:
            return None
        parts.append(src[i + 1:end + 1])

        while i >= 0 and src[i] in " \t\r\n":
            i -= 1
        if i >= 0 and src[i] == ".":
            i -= 1
            while i >= 0 and src[i] in " \t\r\n":
                i -= 1
            continue
        break

    parts.reverse()
    return parts, i + 1


def parse_statements(src: str) -> dict[str, Any]:
    """Walk the source, capturing `a.b.c = <literal>;` assignments."""
    root: dict[str, Any] = {}
    for m in re.finditer(r"=", src):
        eq = m.start()
        # Walk backwards over whitespace to the value that is being assigned.
        j = eq - 1
        while j >= 0 and src[j] in " \t\r\n":
            j -= 1
        if j < 0:
            continue
        # Grab the identifier chain that ends where we stopped. Bracket
        # indexed targets such as `EXPAND["price"]` are supported too.
        found = scan_target(src, j)
        if found is None:
            continue
        parts, start = found
        if not parts:
            continue
        # A type annotation (`var x:Number = ...`) means the identifier we
        # found is a type name, not an assignment target.
        if start > 0 and src[start - 1] == ":":
            continue
        # Skip `==`, `>=`, `<=`, `!=` and compound assignments.
        prev = src[eq - 1] if eq else ""
        prev2 = src[eq - 2] if eq > 1 else ""
        if prev in "=!<>":
            continue
        if prev2 == "=" and prev in "+-*/%&|^":
            continue

        parser = Parser(src, eq + 1)
        try:
            value = parser.value()
        except Exception:
            continue
        if parser.i <= eq + 1:
            continue

        # `A["k"] = v` -> root["A"]["k"] = v
        node = root
        for p in parts[:-1]:
            nxt = node.get(p)
            if not isinstance(nxt, dict):
                nxt = {}
                node[p] = nxt
            node = nxt
        node[parts[-1]] = value

    return root


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__, file=sys.stderr)
        return 2

    # Every input file is parsed and merged into one tree, so the balance
    # tables (serbi.as) and the map layout (zmap.as) can live together.
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    root: dict[str, Any] = {}
    for path in args:
        src = open(path, encoding="utf-8", errors="replace").read()
        parsed = parse_statements(src)
        for key, value in parsed.items():
            if isinstance(value, dict) and isinstance(root.get(key), dict):
                root[key].update(value)
            else:
                root[key] = value

    # Fold the sibling static holders into one namespace.
    statics = {}
    for extra in ("EXPAND", "Mission", "Achievements", "Extra_Upgrade",
                  "Unlocked", "ResearchPoint", "Tips"):
        if extra in root:
            statics[extra] = root.pop(extra)
    if statics:
        root["_statics"] = statics

    if "--ts" in sys.argv:
        # Emit a TypeScript module so the data can be imported directly by
        # Node (for headless tests) as well as by Vite.
        payload = json.dumps(root, indent=2, sort_keys=False, ensure_ascii=False)
        sys.stdout.write(
            "// AUTO-GENERATED by tools/extract_as3_data.py - do not edit.\n"
            "// Source: the decompiled ActionScript of the original game.\n"
            "export default " + payload + " as const;\n"
        )
        return 0

    json.dump(root, sys.stdout, indent=2, sort_keys=False, ensure_ascii=False)
    sys.stdout.write("\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
