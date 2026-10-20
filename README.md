# Resort Empire Reworked

A cross-platform remake of **Resort Empire**, the 2013 isometric resort-management
game by [LittleGiantWorld](https://www.littlegiantworld.com).

The original shipped as a Flash projector, which no longer runs anywhere modern.
This project rebuilds the game as a web application and wraps it in a native
shell, so the same build ships as a Linux package, a Windows installer and an
Android app.

> **Status: early but real.** The simulation, the renderer, the artwork
> pipeline and the native packaging all work. The starting map, the art and the
> basic guest loop match the original. Gameplay depth (guest needs, staff,
> research, achievements, saving) is still to come.
>
> A live preview runs at <http://localhost:5173>.

## What works today

* **A modern interface.** A top bar with live figures (cash, day and time,
  guests, popularity, research), a tool rail on the left, a tabbed management
  panel on the right and a scrolling event log.
* **Build tools.** Inspect, facilities, rooms, scenery, paths and demolish.
  The palette slides out of the tool rail, is searchable and shows prices and
  footprints. Facilities are listed in the order the original unlocked them.
* **Management panels.** Live guest list with mood, facility and room lists
  with upgrade and demolish actions, a staff panel and a reports panel with
  a revenue-by-hour chart.
* **Dialogs.** Finishes, achievements, options, a how-to-play guide and
  save/load (kept in `localStorage`, so saves follow the player between the
  browser and the desktop app).
* **A facility inspector.** Click any building to see its level, how many
  guests it has served, its satisfaction, its popularity and its nightly
  rate, and to upgrade or demolish it.
* The starting map, rebuilt from the original's own data: an asphalt road
  ring, a sidewalk border, a sand buildable plot, a hedge ring and the
  original's scenery layout.
* The original's artwork: ground tiles, the sand floor, hedges, all 22
  facilities and all 29 guest sprites, placed using anchors recovered from
  the SWF.
* A simulation with a 24 hour clock, guests that arrive, walk to a facility,
  get served, pay and affect their mood, popularity driven research points,
  and building and demolition.
* Native packages for Linux: a `.deb` and an `.AppImage`.
* 17 unit tests covering the isometric maths, pathfinding, the building
  rules, saving and a frame budget check.

---

## Why it is built this way

| Requirement | Decision |
| --- | --- |
| Runs on a low-end machine (the target is a 1.6 GHz Celeron with 4 GB RAM) | TypeScript + Canvas 2D. No game engine runtime, no bundled browser. |
| Linux `.deb` / `.AppImage`, Windows `.msi` / `.exe`, Android later | One codebase, wrapped by [Tauri 2](https://tauri.app), which produces every one of those formats from the same source. |
| Faithful to the original | The rules and balance numbers are taken from the original's data tables; the artwork is the original's own vector art, extracted from its SWF. |

## Art

The original's art is Flash vector art, so it cannot simply be copied out of
the `.exe`. The pipeline in `tools/` does it:

1. `ffdec` exports every `DefineSprite` from the embedded SWF as a PNG
   (rasterised, cropped to the visible pixels) and as an SVG (which keeps the
   sprite's own coordinate space).
2. `tools/build_art_manifest.py` reads the SVG's outer transform to work out
   where the sprite's origin ended up inside the cropped PNG, and combines
   that with the PNG into `public/art/manifest.json`.
3. The renderer draws each sprite with that anchor, so the artwork lands on the
   isometric grid exactly where the original put it.

The map maths in `src/core/iso.ts` deliberately mirrors the original's
`rumus.findTileCoord_point`, so no fudge factors are needed.

If the artwork is missing the renderer falls back to procedurally drawn
shapes, so the game always runs.

## Layout

```
src/
  core/        the simulation - no rendering, no DOM, unit tested
    iso.ts         isometric grid maths
    world.ts       the resort: map, facilities, guests, economy, clock
    pathfind.ts    A* over the grid
    data.ts        typed access to the balance tables
  render/      canvas rendering and the artwork loader
  ui/          the DOM heads-up display
  core/data.generated.ts   balance tables, generated from the original
tools/         the asset pipeline
  swf_parse.py           a small SWF reader (bounds, frame counts)
  build_art_manifest.py  PNG + SVG -> manifest
  extract_as3_data.py    the original's data tables -> TypeScript
tests/        simulation tests (node --test)
src-tauri/    the native shell
```

## Building

Requirements: Node 20+, Rust, and the Tauri system dependencies
(`libwebkit2gtk-4.1-dev` on Debian/Ubuntu).

```sh
npm install
npm run dev          # browser preview on http://localhost:5173
npm test             # simulation tests
npm run tauri:build  # native installers for the current platform
```

`npm run tauri:build` produces:

| Platform | Output |
| --- | --- |
| Linux | `src-tauri/target/release/bundle/deb/*.deb` and `.../appimage/*.AppImage` |
| Windows | `.../nsis/*.exe` and `.../msi/*.msi` (build on Windows, or add the `x86_64-pc-windows-msvc` target) |
| Android | `.../apk/*.apk` and `.../aab/*.aab` (needs the Android SDK and JDK) |

## Controls

| Input | Action |
| --- | --- |
| Left click | build the selected facility or plant, or inspect a facility |
| Right click | cancel the current selection |
| Drag | pan the camera |
| Wheel | zoom |
| `W` `A` `S` `D` / arrow keys | pan the camera |
| `Esc` | cancel the current selection |

## The original

* Game by [LittleGiantWorld](https://www.littlegiantworld.com), released in 2013.
* The decompiled sources used as a reference are **not** committed here. They
  can be reproduced with JPEXS ffdec:

  ```sh
  ffdec -export script <outdir> ResortEmpire.swf
  python3 tools/extract_as3_data.py <outdir>/pack/serbi.as --ts > src/core/data.generated.ts
  ```
