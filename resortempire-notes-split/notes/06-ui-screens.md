# HUD, menus, dialogs, tutorial, controls

> Part of the Resort Empire remake notes. Section numbers match the original NOTES.md, so cross-references like "see 8.4" or "§14.1" point to the file listed in `NOTES.md`.

## 9. Screens, HUD and dialogs

### 9.1 Shell and screen flow

`Application` is the game shell. Its timeline has three labelled areas used by code:

| Label / frame | Entered from | Contents |
|---|---|---|
| `menu` | `BackToCover()` | Main menu, name entry, load confirmation, options, credits |
| `pre_load` | `GoToGame0()` | “build map” loading overlay (`waitLayar`) |
| `game` | `JedaToMainGame()` after the white transition | The actual resort, HUD and all in-game dialogs |

`Application` frame scripts are registered on frames 3, 4 and 11. Frame 11 calls `CallProgram()`, which initialises every in-game panel and starts the map build. The original stage is a fixed **640 × 480** 4:3 canvas. No `StageScaleMode` or alignment is set in AS3, so scaling is whatever the Flash container does (normally `showAll`). There is no widescreen layout, safe-area handling or mobile UI.

### 9.2 Main menu

The menu is the `mainMenuD` movie clip. It plays an intro animation and then exposes these buttons:

| Button | Action |
|---|---|
| Play | Opens the new-game / load submenu |
| New Game | Picks a random resort name, opens the name input box, then clears the save and starts day 0 |
| Load | Opens a one-line confirmation showing player name and `day + 1`; disabled when no save exists |
| Options | Music/SFX volume, quality (high/medium/low), defaults |
| Credits | Scrolling credits; **in-game** opening also grants `acv_credit` |
| More / Sponsor | Opens `gamesfree.com` |
| Developer | Opens `littlegiantworld.com` |
| Music / mute | Toggles all music and SFX |
| `btn_cheat` | Hidden development button; each click adds **$10,000** to `cheatPlus`, applied on game start |

There is **one save slot only**. “New Game” calls `ClearData()` and immediately overwrites the existing `dataq` record. There is no confirmation that the old save will be destroyed beyond the name dialog.

### 9.3 In-game HUD

Three persistent navigator clips form the HUD. They slide in from off-screen when the map finishes loading.

| Clip | Position | Contents |
|---|---|---|
| `navigator1` | Top, slides down from `y = −75` | Resort name, star count, RP bar and `RP (n%)`, and five tabs: Employees, Visitors, Rooms, Scenery, Facilities. Also contains the sponsor text and the “hide buildings” alpha button |
| `navigator2` | Left, slides in from `x = −50` | Build tools: Tips, Select/arrow, Drag/hand, Room, Facility, Scenery, Tile, Janitor's Room, Quick Destroy, Resort Upgrade, Expand |
| `navigator3` | Bottom | Money, popularity, day, clock, bonus/floating text, speed 1/2/3, pause/play, Statistics, Legend, Achievements, Follow Us, Settings, music/SFX sliders, auto-pause indicator |

`navigator1` is the information browser. Its tabs open `d_employee`, `d_visitor`, `d_room`, `d_scenery` and `d_facility`; those panels contain the `tabD_*` / `tab_*` lists. The tabs can also focus an object on the map, which is how the original implements “find my visitor”.

`navigator3` owns time control. Speed 1/2/3 sets `speed_effect` to 1/3/5; pause sets `onPaused`. Opening most panels calls `CallAutoPaused()`, which sets a separate `autoPaused` flag and shows a small “auto paused” clip. Closing the panel calls `RemoveAutoPaused()`. The player can therefore leave a dialog open without the resort running.

Keyboard and mouse controls found in the original:

| Input | Action |
|---|---|
| `W A S D` / arrow keys | Pan the map |
| Mouse near screen edge | Pan the map |
| Drag with hand tool (`H`) | Pan the map |
| `V` | Select/arrow cursor |
| `Q` | Hide/show buildings |
| `Esc` or `M` | Cancel or finish placing an object |
| Drag music / SFX sliders (HUD or Options) | Change volume; no mouse-wheel binding |

### 9.4 Build and shop dialogs

All build dialogs are movie clips that read their cards, prices and lock states from `serbi`:

| Dialog | Contents | Notes |
|---|---|---|
| `dialog_room` | Cottage, Lodge | Two large cards; Lodge is star-gated |
| `dialog_facility` | 17 facility types | Includes the four minibooths (Icecream, Hotdog, Taco, Giftshop); locked cards show the required upgrade |
| `dialog_scenery` | 8 plants | `PLANT_1`–`PLANT_8`; later plants unlock by stars/RP |
| `dialog_tile` | 13 purchasable tiles | `TILE_1`–`TILE_13`; the internal `TILE_15` is not in the shop |
| `dialog_extra` | 15 Resort Upgrades | Paginated six cards per page; buying one can unlock a booth |
| `expandD` | Expansion 1 and 2 | Costs $20,000 and $125,000; star 5 and star 8 requirements |
| `dialog_tips` | Tip pages | Paginated; “new tip” badge |

The left navigator also has a direct Janitor's Room button because it is a single booth rather than a category. Selecting a card creates a `TemporaryObject` ghost on the map; the player places and rotates it, then confirms. The ghost is removed if the player cancels or lacks money.

### 9.5 Object inspectors

Clicking an object opens one of seven inspector clips. Which one is chosen depends on the object type and whether it is still under construction.

| Clip | Used for | Main contents |
|---|---|---|
| `DB_object0` | Any object not built yet | Name, description, cancel/close |
| `DB_object1` | Built room / facility / normal booth | Level, stars, XP bar, income, salary, upgrade and destroy buttons, current customer shortcut |
| `DB_object2` | Plant or tile | Picture, description, destroy |
| `DB_object3` | Janitor | Portrait, mood, stamina, promote and fire |
| `DB_object4` | Visitor | Portrait, cash, mood, booked room, check-in/out state, likes/dislikes |
| `DB_object5` | Janitor's Room | Level, stars, cleaning area, assigned janitors, hire/fire, upgrade, rotate |
| `DB_object6` | Minibooth / stand booth | Name, description, uses, level, rotate, destroy |

`propertyD` is a smaller always-available property readout. `warningDestroy` is the destructive-action confirmation. Opening an inspector auto-pauses the simulation.

### 9.6 Reports, progression and system dialogs

| Dialog | Purpose |
|---|---|
| `statD` + `StatIsi` | End-of-day report and a one-day-back view from the last saved record. Income/expense categories, balance, “always show report” checkbox, previous-day button |
| `acvD` | 15-achievement grid with descriptions and rewards |
| `legendD` | Legend and information pages, including special visitors |
| `uplevelD` | “Star up!” reward dialog with money and RP bonus |
| `optionD` | Quality, music volume, SFX volume, reset to defaults |
| `menuD` | In-game menu: Resume, Options, Credits, Exit |
| `FollowD` | Facebook follow offers; each grants $5,000 and 10 RP once per session (the claimed flag is not saved) |
| `creditD` | Credits and links to Facebook/YouTube |
| `warningExitD` | “Return to main menu?” confirmation |
| `dayAnime` | Large “DAY N” transition at the start of each day |
| `autoSavedClip` | Small “DAY N AUTOSAVED” animation |
| `failedD` | “Could not connect” notice for social links |
| `betaD` | Hidden beta panel shown after day 4 only when the SWF host contains `hack` |

The end-of-day report is not just informational. `reportEndDay()` deducts staff and janitor salaries, then `statD` shows the result. Closing the report first calls `autoSavedDataCalling()` when both `onEndDay` and `_saved` are true (the normal end-of-day path), then increments `day` and calls `reloadDayRecord()`, which resets the daily counters and checks missions.

### 9.7 Tutorial and guidance

First run (`day == 0`, no save) starts a scripted tutorial instead of the normal HUD. `GuideDialog` shows a modal guide with a pointer arrow; `GuideInGame` shows smaller in-place instructions. The 20-step sequence (`tutorial.urutan`) covers seven themes:

1. Move the camera.
2. Click an object.
3. Place a path tile and connect the room to the road.
4. Build and place a room.
5. Place a plant.
6. Build a facility.
7. Open the staff/visitor tabs and inspect a visitor.

Tutorial progress itself is **not saved**. On load, `CallProgram()` derives it from the day (`endTutorial = day != 0`), so any save made after day 0 skips the guide. The top-level `gameRecord.endGuide` field is a legacy flag written only by the pre-1.0 migration in `updateVersion()` and is never read. `forcingEndTutorial()` skips the rest of the guide. The tutorial is the only time the game starts at 08:00. Later days start at 00:00.

### 9.8 Development panels

`navigatorX` (the frame class is `z_772`) is a debug overlay. It exposes save/clear, map coordinates, mouse tile, visitor count and population, current visitor type, pathfinding, force checkout, spawn trash, expansion, and a raw “draw” test button. `btn_test` only traces. These controls are development-only and should not be reproduced in the remake.

The main menu's hidden `btn_cheat` and the host-string `betaD` check are also developer leftovers.
