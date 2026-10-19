# Resort Empire Reworked

A cross-platform remake of **Resort Empire**, the 2013 isometric resort-management
game by [LittleGiantWorld](https://www.littlegiantworld.com).

The original shipped as a Flash projector, which no longer runs anywhere modern.
This project rebuilds the game as a web application and wraps it in a native
shell, so the same build ships as a Linux package, a Windows installer and an
Android app.

> **Status: early.** The simulation, the renderer and the artwork pipeline are
> working. Gameplay depth is still a long way from the original.

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

## The original

* Game by [LittleGiantWorld](https://www.littlegiantworld.com), released in 2013.
* The decompiled sources used as a reference are **not** committed here. They
  can be reproduced with JPEXS ffdec:

  ```sh
  ffdec -export script <outdir> ResortEmpire.swf
  python3 tools/extract_as3_data.py <outdir>/pack/serbi.as --ts > src/core/data.generated.ts
  ```
