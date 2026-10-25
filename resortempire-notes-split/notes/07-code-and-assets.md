# Class inventory, assets, rendering

> Part of the Resort Empire remake notes. Section numbers match the original NOTES.md, so cross-references like "see 8.4" or "§14.1" point to the file listed in `NOTES.md`.

## 10. Class inventory

The decompiled project contains **496 `.as` files**. Most are not gameplay classes: they are one-class-per-symbol exports from `assets.swf`. The meaningful split is:

| Package / group | Files | Role |
|---|---|---|
| `exports/scripts/*.as` (root) | 162 | Entry points, embedded art/audio classes, visitor art, map display classes, skins |
| `pack` | 7 | Core data and maths: `serbi`, `zmap`, `rumus`, `co`, `Eventku`, `Mouse1`, `MapContainer` |
| `pack/Instance` | 11 | Runtime objects: `Visitor`, `Janitor`, `Plant`, `Tile`, `Sampah`, `Mobil`, `Notif`, `MoneyClip`, `Outer`, `TemporaryObject`, `Achievement` |
| `pack/Instance/Booths` | 22 | `Booth` base, `Lobby`, 20 buildable booth subclasses |
| `pack/bitmap` | 2 | `BlittingSingle`, `BitmapUtility` |
| `ResortEmpire_fla` | 219 | Timeline/frame classes for every screen, dialog, HUD and animation |
| `fl` | 39 | Adobe Flash UI components (Button, DataGrid, ScrollBar, etc.) |
| `com/greensock` | 33 | TweenLite/TweenMax |
| `puffballPuzzles_fla` | 1 | Sponsor/preloader animation |

### 10.1 Boot and core

| Class | File | Responsibility |
|---|---|---|
| `Main` | `exports/scripts/Main.as` | SWF document class, splash frames, tracker POST, context menu, sitelock stub |
| `Preloader` | `exports/scripts/Preloader.as` | Loading bar, sponsor link, loading completion event |
| `PreloaderCatcher` | `exports/scripts/PreloaderCatcher.as` | Preloader frame helper |
| `Application` | `exports/scripts/Application.as` | 9,228-line controller: state, loop, economy, map wiring, missions, achievements, UI |
| `Eventku` | `exports/scripts/pack/Eventku.as` | Custom event names (`AFTER_TICK`, `SIANG`, `MALAM`, save events) |
| `co` | `exports/scripts/pack/co.as` | Cloning, random ranges, tinting, formatting helpers |
| `rumus` | `exports/scripts/pack/rumus.as` | Isometric transforms, depth sorting, clock formatting |
| `serbi` | `exports/scripts/pack/serbi.as` | All content tables and formulas’ input data |
| `zmap` | `exports/scripts/pack/zmap.as` | Default map tiles, decorations, entry and crab coordinates |

### 10.2 Map and world objects

| Class | File | Responsibility |
|---|---|---|
| `pack.MapContainer` | `exports/scripts/pack/MapContainer.as` | Isometric grid, canvases, BFS pathfinding, object creation, expansion, panning |
| `MapContainer` (root) | `exports/scripts/MapContainer.as` | Embedded display wrapper around `pack.MapContainer` |
| `Outer` | `exports/scripts/pack/Instance/Outer.as` | Decorative outside-map tile/edge |
| `Tile` | `exports/scripts/pack/Instance/Tile.as` | Ground tile, walkability, popularity, destruction |
| `TileClip` | `exports/scripts/TileClip.as` | Tile art symbol used by the bitmap cache |
| `GroundSelect` | `exports/scripts/GroundSelect.as` | Placement highlight |
| `BoothTile` | `exports/scripts/BoothTile.as` | Booth floor/wall art symbol |
| `Wall` | `exports/scripts/Wall.as` | Booth wall art symbol |
| `TemporaryObject` | `exports/scripts/pack/Instance/TemporaryObject.as` | Ghost object during placement |
| `Area` | `exports/scripts/Area.as` | Map area/guide overlay |
| `Titik`, `Titik2` | `exports/scripts/Titik*.as` | Small marker/point symbols |
| `SandTile` | `exports/scripts/SandTile.as` | Sand tile art |

### 10.3 Buildings

`pack.Instance.Booths.Booth` is the base class for every booth. It handles placement, build cost, queue, served/cancelled visitors, XP, level-up, salary, popularity, tips and destruction. Subclasses mostly supply art and reference data.

| Class | Type | Notable behaviour |
|---|---|---|
| `Booth` | Base | Build/upgrade, queue, payment, tips, XP, stars, staff, popularity |
| `Lobby` | Check-in | Reservations, room assignment, checkout, room payments |
| `Cottage` | Room | Sleep animation, room booking, guest stay |
| `Lodge` | Room | Same, higher tier and star-gated |
| `Sauna`, `Gym`, `Jacuzi`, `Arcade`, `Spa`, `Pool`, `Golf` | Facility | Timed visits, mood/popularity effects |
| `Medical` | Facility | Required by old visitors and Mr. Rock |
| `Bar`, `JapanResto`, `BaratResto`, `IndiaResto` | Restaurant | Meals, mood, tips |
| `Minimarket` | Shop | Random sale price between `4 + level` and `booked_price[level−1]`, capped by visitor cash |
| `Icecream`, `Hotdog`, `Taco`, `Giftshop` | Minibooth / stand | Fixed footprint, queue at counter, random price range |
| `JanitorRoom` | Service | Cleaning radius, janitor slots, upgrade area |

### 10.4 People, effects and props

| Class | File | Responsibility |
|---|---|---|
| `Visitor` | `pack/Instance/Visitor.as` | 5,578-line visitor AI: arrival, pathing, needs, room stay, spending, mood, hygiene, leaving |
| `Visitor1`–`Visitor29` | root | Embedded visitor appearance/animation symbols; **not** AI classes |
| `Janitor` | `pack/Instance/Janitor.as` | Cleaning AI, stamina, XP, promotion, salary |
| `Mobil` | `pack/Instance/Mobil.as` | Cars/buses bringing visitors |
| `Sampah` | `pack/Instance/Sampah.as` | Trash object; reduces popularity until cleaned |
| `Notif` | `pack/Instance/Notif.as` | In-world notification bubble |
| `MoneyClip` | `pack/Instance/MoneyClip.as` | Floating “+$” / “−$” animation |
| `Achievement` | `pack/Instance/Achievement.as` | Achievement popup object |
| `Plant` | `pack/Instance/Plant.as` | Scenery placement and popularity |
| `Opening` | `exports/scripts/Opening.as` | Intro cutscene controller |
| `GuideDialog`, `GuideInGame` | root | Tutorial overlays |

### 10.5 UI classes

The 219 `ResortEmpire_fla` classes are timeline symbols. They are grouped by filename:

| Prefix / examples | Role |
|---|---|
| `mainMenuD`, `BoxInputName`, `BoxLoadGame`, `optionD`, `creditD`, `UpdateVersionD` | Menu and boot UI |
| `navigator1`, `navigator2`, `navigator3`, `z_772` | HUD and debug overlay |
| `dialog_room`, `dialog_facility`, `dialog_scenery`, `dialog_tile`, `dialog_tips`, `dialog_extraUpgrade`, `expandD` | Build/shop dialogs |
| `DB_object0`–`DB_object6`, `DB_object_onbuild`, `propertyD`, `warningDestroy` | Object inspectors |
| `d_employee`, `d_visitor`, `d_room`, `d_facility`, `d_scenery` + `tab*` | Browser panels |
| `statD`, `stat_737`, `StatIsi` | Reports |
| `acvD`, `legendD`, `uplevelD`, `FollowD`, `failedD`, `menuDclip`, `warningExit` | System dialogs |
| `dayAnime`, `AutoSavedClip`, `stageAutoPaused`, `balonD`, `quickdestroy_notif` | In-world/HUD animations |
| `Clip*`, `vcustomer*`, `emp*`, `booth_*`, `border_*`, `ground*` | Booth/visitor art symbols |

The `fl.*` package is Adobe's component framework (Button, DataGrid, ScrollBar, focus manager). It is only needed for the original skinning/scroll behaviour; a Godot remake will not port it.

### 10.6 Audio and third-party code

| Group | Files | Role |
|---|---|---|
| `BGMusic1`–`BGMusic5` | root | Five music loops selected by menu/day state |
| `ClickSound1`–`3`, `Coin1`, `BuildSound`, `Upgrade`, `PauseSound`, etc. | root | One-shot SFX embedded as classes |
| `com.greensock` | 33 | TweenLite/TweenMax used by nearly every dialog |
| `fl` | 39 | Adobe UI components |
| `puffballPuzzles_fla` | 1 | Sponsor preloader animation |

### 10.7 Reading order for a remake

If you need to re-check a formula, read in this order:

1. `pack/serbi.as` — the data.
2. `Main.as` and `Preloader.as` — boot and tracker.
3. `Application.as` — state, loop, money, missions, achievements, save/load.
4. `pack/MapContainer.as` — grid, pathfinding, placement.
5. `pack/Instance/Booths/Booth.as` — build/upgrade/income.
6. `pack/Instance/Booths/Lobby.as` — reservations and room payments.
7. `pack/Instance/Visitor.as` — visitor decisions, stay, mood, spending.
8. `pack/Instance/Janitor.as` — cleaning and salaries.
9. `ResortEmpire_fla/statD_734.as` + `StatIsi_735.as` — day report.
10. `pack/rumus.as`, `pack/co.as`, `pack/zmap.as` — maths and defaults.

## 11. Assets and rendering

### 11.1 What is in the decompiled folder

`exports/` is **254 MB** across **36,275 files**. The size is mostly one file per exported sprite frame, not runtime content.

| Folder | Files | Size | Contents |
|---|---:|---:|---|
| `exports/sprites/` | 32,093 | 226 MB | One folder per `DefineSprite`, each frame as SVG/PNG |
| `exports/images/` | 1,147 | 5.1 MB | Bitmap images |
| `exports/shapes/` | 1,552 | 7.9 MB | Vector shapes as SVG |
| `exports/scripts/` | 532 | 8.1 MB | 496 decompiled `.as` files (3.5 MB) plus `_assets/` (36 files, 4.6 MB) |
| `exports/buttons/` | 476 | 2.5 MB | Button states |
| `exports/sounds/` | 37 | 1.5 MB | Music and SFX |
| `exports/fonts/` | 37 | 624 KB | Embedded fonts |
| `exports/texts/` | 387 | 1.5 MB | Static text assets |
| `exports/frames/` | 13 | 468 KB | Timeline frames |
| `exports/scripts/_assets/assets.swf` | 1 | 3.1 MB | The embedded asset library |
| `exports/symbolClass/symbols.csv` | 1 | 12 KB | 393 symbol/class mappings |

The playable `ResortEmpire.swf` at the project root is **3.7 MB**.

### 11.2 Art style and dimensions

The original is a fixed 4:3 isometric game at **640 × 480**, **23 fps**. It uses a 2:1 isometric projection with a 24 px grid:

| Item | Size / offset |
|---|---|
| Isometric grid step (`SIZE_`) | 24 px horizontally, 12 px vertically |
| Tile bitmap cell | 50 × 26 |
| Plant bitmap | 70 × 50, offset (0, 50) |
| Booth/ wall bitmap | 240 × 136, offset (25, 84) |
| Map starting size | 37 × 37 |
| Expansion 1 | 43 × 43 |
| Expansion 2 | 50 × 50 |

Map art is pre-rendered into bitmap canvases by `BlittingSingle`: it steps a `MovieClip` through every frame and draws each frame into a `BitmapData`. Five canvases are layered:

1. `tileCanvas` — ground tiles.
2. `groundCanvas` — ground details.
3. `blokCanvas` — blocking/placement indicators.
4. `accCanvas` — accessories such as paths and highlights.
5. `gridCanvas` — grid overlay.

Booths and plants are separate `Bitmap` objects placed on top and depth-sorted by `rumus.findDepth()` (`iso.y − depthshift − iso.x + 10000`). The camera is not a real camera: `MapSprite` is a large clip that is moved around the stage, with bounds calculated from the current expansion. The map is clipped by the 640 × 480 stage, and the HUD sits above it.

### 11.3 Animation and UI

- World objects use frame-based `MovieClip` animation (visitor walk cycles, booth customers, sleeping, cleaning, cars).
- UI uses timeline animations plus GreenSock tweens for open/close scaling and sliding.
- The clock, day transition, money popups and notification balloons are separate display objects, not part of the map canvas.
- The “hide buildings” alpha button makes booths semi-transparent so visitors remain visible.
- The game pre-renders map tiles once per map change; it does not redraw the whole map every frame.

### 11.4 Audio

There are 37 sound files:

| Group | Files |
|---|---|
| Music loops | `BGMusic1`–`BGMusic5` |
| UI/feedback | `ClickSound1`–`3`, `Coin1`, `BonusCoin1`, `Cling`, `Glick`, `Pop1`, `PauseSound`, `NotifSound`, `Ticking`, `Upgrade` |
| World | `BuildSound`, `Destroy1`, `Destroy2`, `Deskbell`, `Fired`, `Klakson`, `TrukSound`, `Car2`, `Seat`, `Zip`, `Puh`, `Blub`, `Blub2`, `Adding`, `SoundGling1`, `Cengkling` |
| Intro | `SE_Intro_Explode` |
| Unnamed | `-1.wav`, `2835.mp3`, `2861.mp3` |

The game has separate music and SFX volume, persisted only in memory (not in `dataq`). Music selection changes between menu, day and night.

### 11.5 Porting implications

- The extracted art is usable as a reference, but the original look depends on pre-rendered 23 fps sprite timing and 640 × 480 composition. Reusing PNG frames directly is possible; redrawing at a higher resolution is a separate art project.
- Godot's `YSort` can replace `findDepth()`, but the original depth formula must be preserved for overlapping booth footprints.
- The original map is a single 50 × 50 maximum grid. A Godot `TileMapLayer` with isometric cells would be lighter than 2,500 individual nodes, but it changes how placement and walkability are stored.
- Original pathfinding is BFS over walkable tiles. A* would be faster on the 50 × 50 map but can produce different routes; use BFS first for fidelity.
