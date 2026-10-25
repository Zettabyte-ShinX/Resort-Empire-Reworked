# Where to read in the decompiled source

> Part of the Resort Empire remake notes. Section numbers match the original NOTES.md, so cross-references like "see 8.4" or "§14.1" point to the file listed in `NOTES.md`.

## Appendix C — Source map

Line counts are from `wc -l`; ranges are approximate and intended as a reading guide, not stable API boundaries.

### C.1 Where to read

| File | Lines | What it contains |
|---|---:|---|
| `exports/scripts/Main.as` | 209 | SWF document class, splash frames, tracker POST, context menu, sitelock stub |
| `exports/scripts/Preloader.as` | 103 | Preloader bar, sponsor link, loading completion |
| `exports/scripts/Application.as` | 9,228 | Main controller. See the range table below |
| `exports/scripts/pack/serbi.as` | 2,841 | All content data: scenery, tiles, booths, visitors, missions, achievements, extras, tips, RP |
| `exports/scripts/pack/MapContainer.as` | 2,196 | Isometric map, canvases, pathfinding, object creation, expansion |
| `exports/scripts/pack/rumus.as` | 270 | Isometric transforms, depth, tile hit-testing, clock formatting |
| `exports/scripts/pack/co.as` | 473 | Cloning, random ranges, tinting, formatting |
| `exports/scripts/pack/zmap.as` | 184 | Default map tiles, decorations, entry/crab coordinates |
| `exports/scripts/pack/Eventku.as` | 40 | Custom event constants |
| `exports/scripts/pack/Instance/Booths/Booth.as` | 3,338 | Booth base: build, upgrade, queue, payment, tips, XP, popularity, staff |
| `exports/scripts/pack/Instance/Booths/Lobby.as` | 700 | Check-in/check-out, room assignment, room payment |
| `exports/scripts/pack/Instance/Visitor.as` | 5,578 | Visitor AI, arrival, pathing, needs, room stay, spending, mood, leaving |
| `exports/scripts/pack/Instance/Janitor.as` | 2,045 | Cleaning AI, stamina, promotion, salary |
| `exports/scripts/pack/Instance/Plant.as` | 475 | Scenery placement, popularity, destruction |
| `exports/scripts/pack/Instance/Tile.as` | 617 | Tile placement, walkability, popularity, destruction |
| `exports/scripts/pack/Instance/Sampah.as` | 176 | Trash object and cleaning target |
| `exports/scripts/pack/Instance/TemporaryObject.as` | 307 | Placement ghost and validity checks |
| `exports/scripts/pack/Instance/Outer.as` | 93 | Outside-map decoration |
| `exports/scripts/pack/Instance/Notif.as` | 411 | In-world notification bubbles |
| `exports/scripts/pack/Instance/MoneyClip.as` | 122 | Floating money animation |
| `exports/scripts/ResortEmpire_fla/statD_734.as` | 413 | End-of-day report dialog |
| `exports/scripts/ResortEmpire_fla/StatIsi_735.as` | 596 | Report categories and totals |
| `exports/scripts/ResortEmpire_fla/navigator1_617.as` | 356 | Top HUD and browser tabs |
| `exports/scripts/ResortEmpire_fla/navigator2_604.as` | 939 | Left build toolbar |
| `exports/scripts/ResortEmpire_fla/navigator3_637.as` | 471 | Bottom HUD, speed, time, money, menus |
| `exports/scripts/ResortEmpire_fla/dialog_facility_518.as` | 293 | Facility shop |
| `exports/scripts/ResortEmpire_fla/dialog_room_560.as` | 153 | Room shop |
| `exports/scripts/ResortEmpire_fla/dialog_extraUpgrade_663.as` | 358 | Resort Upgrade shop |
| `exports/scripts/ResortEmpire_fla/DB_object1_579.as` | 378 | Booth/room inspector |
| `exports/scripts/GuideDialog.as` | 448 | Modal tutorial guide |
| `exports/scripts/GuideInGame.as` | 102 | In-place tutorial hints |
| `exports/scripts/ResortEmpire_fla/creditD_504.as` | 114 | Credits and social links |
| `exports/scripts/_assets/assets.swf` | — | Embedded art/audio library |
| `exports/symbolClass/symbols.csv` | 393 rows | Symbol-to-class map |

### C.2 `Application.as` reading ranges

| Range | Topic |
|---|---|
| 1–520 | Imports, display-object declarations, state variables |
| 525–760 | Constructor, frame registration, `initMainMenu()`, `CheckLocalData()`, `RenderMovieClipAsBitmap()` |
| 760–1140 | Menu actions, save detection, achievements init, version migration, `ClickMainMenu()` |
| 1145–1480 | `DefaultGameVars()`: starting money, unlocks, missions, tips, RP, IDs |
| 1481–1745 | `FromDataRecord()`, `NeedToGameRecord()`, `ClearData()`, `SaveData()`, `autoSaved()` |
| 1749–2050 | `CallProgram()`, map setup, UI init, tutorial start |
| 2096–2280 | `MainLoop()`, `TimerFunction()`, end-of-day trigger, report close |
| 2226–2320 | `closingStatFunction()`, autosave call, `ShowFirstReport()` |
| 2582–2725 | `reportEndDay()`, day rollover, `anime_startNewDay()`, deficit checks |
| 3004–3275 | RP click rewards, guide/temporary object checks |
| 3481–3830 | Special visitor conditions, visitor/car spawning |
| 4021–4075 | `TimerFunction()`, `CounterHour()`, `CalculateHour()` |
| 4354–4840 | Popularity components and updates |
| 4853–5270 | RP totals, stars, unlocks, extra upgrades, expansion effects |
| 6180–6260 | Mission evaluation and achievement completion |
| 6640–6720 | Individual achievement checks |
| 7126–7190 | Auto-pause and pause state |
| 8481–8525 | Speed setting (`1/3/5`) |
| 8980–9130 | Facebook/website/YouTube links and bonuses |
| 9140–9175 | Debug panel save/clear/checkout hooks |

### C.3 `serbi.as` section map

| Approx. line | Data |
|---:|---|
| 9 | `EXPAND` sizes and prices |
| 21 | Entry/exit points for visitors and cars |
| 55 | `dataOb.Scenery` (8 plants) |
| 225 | `dataOb.Tile` (26 entries incl. `TILE_0`; 13 purchasable; internal `TILE_15`) |
| 502 | `dataOb.Booth` (21 real types + `boostMood` helper) |
| 1215 | `dataOb.listing` (17 facility types) |
| 1216 | `dataOb.usedTimer` (per-visitor facility durations) |
| 1237 | `dataOb.Visitor` (29 types) |
| 1960 | `Mission` definitions (94) |
| 2430 | `Mission.listing` (evaluation order) |
| 2432 | `Achievements` (15) |
| 2522 | `Extra_Upgrade` (15) |
| 2658 | `Tips` (21 listing entries, 20 unique) |
| 2680 | `Tips.listing` |

### C.4 How these notes were produced

- Static reading of the decompiled `.as` files with `grep`, `sed` and `wc`.
- A small extraction script (`/tmp/opencode/extract_serbi.mjs`) parsed `serbi.as` into JSON for the large tables. Because AS3 arrays use string keys, the JSON was cross-checked against the source wherever keys mattered (missions, tips, achievements, stats).
- No runtime testing was performed. Everything here is source-derived; timing, feel and some UI geometry still need verification in the original SWF or a test harness.
- `exports/` was treated as read-only. No original files were modified.
- The remake has not been started; there is no `godot/` directory or game code yet.

### C.5 Verification checklist for the notes

If you want to spot-check this document:

1. `wc -l exports/scripts/Application.as` → 9,228.
2. `grep -n 'SharedObject.getLocal' exports/scripts/Application.as` → `dataq` at line 198.
3. `grep -n 'speed_effect =' exports/scripts/Application.as` → `1/3/5` mapping in `SettingSpeed()`.
4. `grep -n 'addUangTip' exports/scripts/pack/Instance/Booths/Booth.as` → tip logic starting at line 2,980.
5. `grep -n 'countTotalAcv' exports/scripts/Application.as` → completion threshold at line 6,251.
6. `grep -n 'track.g-bot.net' exports/scripts/Main.as` → tracker POST at line 167.
7. `grep -n 'upgradeBooth' exports/scripts/pack/serbi.as` → duplicate in `Tips.listing`.
8. `grep -n 'price.*7500,9000,9600' exports/scripts/pack/serbi.as` → Medical price.

If any of these no longer match, the decompiled source or the notes have changed and the discrepancy should be resolved before using the document as a specification.
