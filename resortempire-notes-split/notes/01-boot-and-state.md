# Boot, frame flow, game state and map

> Part of the Resort Empire remake notes. Section numbers match the original NOTES.md, so cross-references like "see 8.4" or "§14.1" point to the file listed in `NOTES.md`.

## 2. Entry point and frame flow

### 2.1 Startup

`Main.as` is the SWF document class.

- On construction it reads `loaderInfo.url`, extracts the host, and calls `adaTulisanHack()`.
  - If the host contains `"hack"`, `url_hack = true`. This is only used later to show the hidden `betaD` panel after day 4.
  - A `sitelock()` function exists with `urls_allowed = ["game.gamesfree.com"]`, but **it is never called**. `lockedSite` is always hidden. So there is effectively no sitelock.
- It adds the preloader and starts loading.
- On `Preloader.COMPLETE`, `Main` does `gotoAndStop(3)`.

`Main` timeline frames (from `addFrameScript`):

| Frame | What happens |
|---|---|
| 1 | Stop. If not loaded from `file:`, allow all domains, load `track.g-bot.net/crossdomain.xml`, POST tracker data. Build right-click menu. |
| 2 | Stop. |
| 3 | Stop. |
| 4 | Stop. Sponsor splash (`splash_sponsor`). |
| 5 | Stop. Little Giant splash (`splash_lg`). |
| 13 | Stop. |

`Application` is symbol **4047** on the Main timeline. Its own timeline:

| Frame | What happens |
|---|---|
| 3 | Stop; hide credits; `initMainMenu()`. Main menu. |
| 4 | `PreLoad()`; loading screen while game assets/objects are prepared. |
| 11 | Stop; `CallProgram()`; gameplay starts. |

### 2.2 First-run flow

1. Main menu (`mainMenuD`) → **New Game** or **Load Game**.
2. New Game asks for a player name (`Box_inputName`) and creates defaults.
3. If there is no finished tutorial, the 20-step guided tutorial starts (`GuideDialog`, `GuideD_box`, `GuideInGame`). **Game time is frozen during the tutorial**: while `endTutorial` is false the stage runs `Temp_MainLoop`, which only handles camera panning and notifications, and `MainLoop` also gates `TimerFunction()` on `endTutorial`.
4. When the tutorial reaches `introduction`, `FirstCallNextDay()` increments the internal day from 0 to 1 and sets the clock to 08:00.
5. Gameplay HUD appears. The opening animation (`Opening`, `tutup`) ends and the main loop starts.

### 2.3 Logo / splash / credits

- Sponsor splash → `gamesfree.com`
- Little Giant splash → `littlegiantworld.com`
- Credit screen `creditD`. Opening it from the **in-game** menu grants the `acv_credit` achievement (“ENTER THE CREDIT”, $1,500 + 2 RP); opening it from the main menu does not.

## 4. Game state and the map

### 4.1 The `game` object

`CreateNewVariables()` and `DefaultGameVars()` build a single `game` object. Main groups:

| Field | Meaning |
|---|---|
| `game.map`, `game.tiles`, `game.objects` | Map and placed objects |
| `game.objects.Lobby` | The single fixed lobby object record |
| `game.objects.Scenery`, `.Facility`, `.Cottage`, `.Lodge`, `.JanitorRoom`, `.Mobil` | Arrays of placed object records |
| `game.visitors` | Active visitors |
| `game.janitors` | Hired janitors |
| `game.sampah` | Trash objects |
| `game.notif` | Notification objects |
| `game.ID` | Per-type incrementing IDs (`Lobby`, `Visitor`, `Janitor`, `Cottage`, …, `Achievement`) |
| `game.SUM` | Counts per facility type + `Tile` |
| `game.popularity` | Popularity contributions by category |
| `game.totalRP` | RP by category: `Scenery`, `Tile`, `Khusus`, `Facility`, `Room`, `Lobby`, `JanitorRoom`, `Janitor`, `Mobil` |
| `game.RP_khusus` | One-shot RP rewards (clicks, first destroys, etc.) |
| `game.UNLOCKED` | Unlocked booths/plants/expansions |
| `game.UNLOCKED_new` | “New!” badge flags |
| `game.EXTRA` | Purchased resort upgrades |
| `game.ACV` | Achievement flags |
| `game.specialVisitor` | State for Visitor25–29 |
| `game.Missions` | Array of `{initial, cleared, onsort}` in listing order |
| `game.Tips` | Tip seen/new state |
| `game.MISC` | Daily accounting and satisfaction accumulators |
| `game.TempData` | Pooled visitor names (`Male`, `Female`, `Couple`, `Staff`) |

### 4.2 Map and placement

`pack/MapContainer.as` owns:

- Isometric coordinate conversion and depth sorting.
- The tile graph used by BFS pathfinding.
- Creating/destroying tiles, scenery, booths, janitor rooms and cars.
- The default map and lobby.
- Expansion (rebuilding the map at 43×43 / 50×50).
- “Walkable path” validation when placing objects.

`pack/zmap.as` seeds the default map:

- The starter path: 12 tiles at **x = 10…15, y = 20…21**, plus two walkable tiles at `(10,22)` and `(10,23)` that are not flagged as visitor path (`ipath:false`).
- A list of decorative plants and “crab” decorations around the map.
- Expansion sizes and land sizes are in `serbi.EXPAND`:
  - Level 0: 37×37, land 16×16
  - Level 1: 43×43, land 22×22
  - Level 2: 50×50, land 29×29
  - Prices: **$0 / $20,000 / $125,000**

The lobby is created at `(14, 22)` with a 2×4 footprint. Visitors enter from the road/outer tiles and must be able to path to a booth’s entrance tile.

**Build rule:** every booth must touch at least one walkable path tile; the game recalculates the path graph after every build/destroy. Booths can be rotated (`RP_khusus.rotate_a_booth`). Destroying does **not** refund money; it only awards one-shot RP the first time per category.
