# Resort Empire — Godot map stage

The project opens the 37×37 isometric map at 640×480. The ground grid, camera
and debug overlay are in place. There are no art assets or gameplay yet: no
booths, visitors or simulation. The JSON data files are generated from the
decompiled AS3.

## Requirements

- Godot 4.7+ (GL Compatibility renderer)
- Python 3.10+ (standard library only)

## Run

```bash
godot --path godot
```

The project renders at 60 fps into a 640×480 play area, integer-scaled with
pillarboxing, matching the approved defaults in the notes.

## Controls

| Input | Action |
|---|---|
| Mouse wheel | Zoom toward the cursor |
| Left, middle or right drag | Pan the map |
| One-finger drag | Pan the map |
| Two-finger pinch | Zoom and pan |

The debug overlay in the top-left shows the tile coordinates under the mouse
or touch point, the map size and the current zoom.

## Data

The single source for content numbers is
`../exports/scripts/pack/serbi.as`. Regenerate all JSON with:

```bash
python3 godot/tools/generate_data.py
```

Output:

- `data/booths.json` — 21 booths, unlock levels
- `data/visitors.json` — 29 visitor types, spawn/name rules
- `data/missions.json` — 94 missions in order
- `data/achievements.json` — 15 achievements
- `data/extras.json` — 15 resort upgrades and star-level pages
- `data/scenery.json` — plants, including technical entries
- `data/tiles.json` — all tile types

Check the generated data against the split notes:

```bash
python3 godot/tools/validate_data.py
```

The validator reads `../resortempire-notes-split/notes/*.md`, so run it after
changing either the generator or the notes.

## Layout

```
godot/
  project.godot
  scenes/Main.tscn
  scripts/Main.gd
  scripts/Iso.gd       original 2:1 projection and map bounds
  scripts/TileGrid.gd
  scripts/TileHighlight.gd
  scripts/MapCamera.gd
  scripts/DebugOverlay.gd
  data/*.json          generated, committed
  tools/generate_data.py
  tools/validate_data.py
```
