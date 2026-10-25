# Resort Empire — Godot remake

A from-scratch Godot 4 remake of **Resort Empire**, the 2013 isometric
resort-management game by LittleGiantWorld. The original shipped as a Flash
projector that no longer runs on modern systems.

This repository currently contains the **project skeleton, data pipeline and
isometric map stage**. There is no gameplay yet.

## Status

- Godot 4.7 project, Compatibility renderer
- 640×480 play area, integer-scaled and pillarboxed, 60 fps rendering
- 37×37 isometric map using the original 2:1, 24×12 tile projection
- Mouse and touch camera: drag to pan, wheel or pinch to zoom
- Debug overlay with the tile coordinates under the cursor
- Classic-mode defaults from the approved notes
- All content numbers generated from the decompiled AS3 into committed JSON
- 1,310 automated checks against the split notes

## Run

```bash
godot --path godot
```

Headless check (loads and parses every data file):

```bash
godot --headless --path godot --quit
```

## Data pipeline

The content source is the decompiled `serbi.as` from the original SWF. It is
kept locally and is not committed here.

Regenerate all JSON:

```bash
python3 godot/tools/generate_data.py
```

Validate the generated data against the notes:

```bash
python3 godot/tools/validate_data.py
```

Generated files under `godot/data/`:

| File | Content |
|---|---|
| `booths.json` | 21 booths, use timers, unlock levels |
| `visitors.json` | 29 visitor types, spawn/name rules, hygiene table, timers |
| `missions.json` | 94 missions in original order |
| `achievements.json` | 15 achievements |
| `extras.json` | 15 resort upgrades plus star-level pages |
| `scenery.json` | 19 entries (8 buyable plants plus technical entries) |
| `tiles.json` | 26 tile types |

Raw AS3 field names are preserved (`nama`, `ROWS`, `COLS`, `booked_price`,
`xpt`, `RP_upgrade`, `batas`, …). Computed values are materialized explicitly
and disclosed under `_derived` in each JSON file.

## Layout

```
godot/
  project.godot
  scenes/Main.tscn
  scripts/*.gd
  data/*.json
  tools/generate_data.py
  tools/validate_data.py
  README.md
resortempire-notes-split/
  NOTES.md
  notes/*.md
```

## Local-only reference inputs

These are needed to regenerate the data but are intentionally excluded from
the repository:

- `exports/` — 254 MB decompiled original (36,275 files)
- `ResortEmpire.swf` — original game binary
- `Resort Empire Sunset Skyline.png` — reference art
- `resortempire-notes-split.zip` — duplicate archive of the notes

## Notes

Read `resortempire-notes-split/NOTES.md` first. It is the index; load only the
section files a task needs. The generated JSON is the source of truth for
numbers, and the note tables are used to check it.
