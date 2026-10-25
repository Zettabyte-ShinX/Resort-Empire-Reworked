# Resort Empire — remake notes from the decompiled AS3

**Status:** static analysis of the decompiled original. No runtime testing yet.
**Source:** `ResortEmpire.swf` (3.7 MB) and `exports/` (decompiled 254 MB, 496 `.as` files).
**Scope:** original behaviour, data, formulas, UI and dependencies. No Godot code has been written.

> The decompiled folder is actually `exports/` (plural). `/export` in the brief and `AGENTS.md` does not exist.

---

---

## How to use these notes

The notes were split so an agent with a small context window can load only what a task needs. **Always read this file first**, then read only the files for the task:

- Clock, ticks, day structure: this file (section 3).
- Economy or salaries: `notes/02-economy.md`
- Visitors, rooms, tips, popularity: `notes/03-visitors-popularity.md`
- Any number from a table (prices, stats, unlocks): `notes/05-content-data.md` or the generated JSON in `godot/data/` (the JSON is the source of truth once it exists)
- Missions/achievements/stars: `notes/04-progression.md` + `notes/appendix-missions.md`
- Bugs to preserve in classic mode: `notes/09-quirks-and-bugs.md`
- Decisions already approved: `notes/10-decisions.md`

Section numbers are unchanged from the original single file, so "see 8.4" means section 8.4 in the file listed below.

| Section | File |
|---|---|
| 1. At a glance | this file |
| 2. Entry point and frame flow | `notes/01-boot-and-state.md` |
| 3. Main loop and time | this file |
| 4. Game state and the map | `notes/01-boot-and-state.md` |
| 5. Money, income and expenses | `notes/02-economy.md` |
| 6. Visitors, rooms, popularity and staff | `notes/03-visitors-popularity.md` |
| 7. Progression: RP, stars, unlocks, missions, achievements | `notes/04-progression.md` |
| 8. Buildings and items | `notes/05-content-data.md` |
| 9. Screens, HUD and dialogs | `notes/06-ui-screens.md` |
| 10. Class inventory | `notes/07-code-and-assets.md` |
| 11. Assets and rendering | `notes/07-code-and-assets.md` |
| 12. Saving and loading | `notes/08-saving-and-network.md` |
| 13. Server and external dependencies | `notes/08-saving-and-network.md` |
| 14. Original quirks and likely bugs | `notes/09-quirks-and-bugs.md` |
| 15. Open questions / decisions needed | `notes/10-decisions.md` |
| Appendix A — All 94 missions | `notes/appendix-missions.md` |
| Appendix B — Tips text | `notes/appendix-tips.md` |
| Appendix C — Source map | `notes/appendix-source-map.md` |

---

## 1. At a glance

| Item | Original |
|---|---|
| Genre | Isometric resort tycoon / management |
| Tech | Flash AS3, Adobe components (`fl.*`), GreenSock TweenMax |
| Stage | **640 × 480**, 4:3, **23 fps**, background `#cccccc` (`Main.as` line 15) |
| Entry class | `Main` (`[SWF]` document class) |
| Main controller | `Application` (symbol 4047, ~9,200 lines) |
| Save | Local `SharedObject` named **`dataq`**, single slot |
| Map | Isometric grid, **37×37** at start; expands to 43×43 and 50×50 |
| Starting money | **$10,000** |
| Starting time | Day 1, **08:00** (after the intro) |
| Lobby | Pre-placed at tile **(14, 22)**, 2×4 footprint |
| Booth types | **21** total: fixed Lobby + 20 player-built types |
| Visitor types | **29** (24 regular + 5 special) |
| Missions | **94**, evaluated strictly in order |
| Achievements | **15** |
| Resort upgrades | **15** “extra” upgrades (also unlock most booths) |
| Fail state | None. Negative money triggers a subsidy, not a game over |

The original is a single-player, local-save game. It has no account system, no cloud save, no multiplayer and no server-side economy. The only network calls are an analytics ping and external website links.

---

## 3. Main loop and time

### 3.1 Loop chain

`MainLoop` is bound to `Event.ENTER_FRAME` on the stage:

```text
ENTER_FRAME
└─ MainLoop()
   ├─ if !onPaused && !animeDay && endTutorial:
   │    └─ TimerFunction()
   │         ├─ counter += speed_effect
   │         ├─ CalculateHour()
   │         ├─ update clock display
   │         └─ if the whole-second value changed:
   │              └─ AFTER_TICK → DoSomethingAfterTick()
   ├─ MusicLoopEffects()
   ├─ notificationFunction()
   └─ camera panning (MoveAuto / MoveWithPress)
```

`DoSomethingAfterTick()` is the **AI tick**. It is dispatched when `sec = floor(counter / 23)` changes. On average that is one event per **23 counter ticks** (≈2.56 game minutes), i.e. about one real second at speed 1. Because `counter` steps by 1/3/5, the spacing jitters at speed 2/3 (21 or 24 ticks, and 20 or 25 ticks, respectively), but the long-run rate is the same. It is *not* once per frame and *not* once per game minute. It:

1. Cleans up trash and notification objects.
2. If `hourDay` is 6–18: daytime branch; spawns visitors, special visitors and cars.
3. Otherwise: night branch; special visitors only between 05:00 and 22:00, normal visitors with a lower chance. Between 01:00 and 05:00 there is an extra 25% gate.
4. If `day < HitungHari()`, ends the day:
   - `reportEndDay()` deducts salaries.
   - Shows the end-of-day report (`statD`) or auto-continues.
   - When the report closes: autosave (`autoSaved()`), then `continueDayGame()` increments `day`, sets `rday = day % 2`, refreshes the day counter and reloads the day record.
   - `anime_startNewDay()` plays the day banner; `startNewDay()` restarts the main loop after the animation.

### 3.2 Clock maths

```text
FR        = stage.frameRate = 23
max_sec   = 9          // counter ticks per game minute
max_minute= 60
counter  += speed_effect each frame
minute    = counter / 9
hour      = minute / 60
hourDay   = hour % 24
minuteDay = minute % 60
HitungHari() = floor(hour / 24) + 1
```

So:

- **540 counter ticks = 1 game hour**
- **12,960 counter ticks = 1 game day**
- At 23 fps and speed 1, one game hour ≈ **23.5 real seconds**, one day ≈ **9 min 23 s**.
- Day/night switch at **06:00** and **18:00**.
- The `AFTER_TICK` AI tick fires when `sec = floor(counter / 23)` changes: on average every **23 counter ticks** (≈ **2.56 game minutes**). At speed 1 the gap is exactly 23 ticks (~1.0 s); at speed 2 it is 21 or 24 ticks (~0.30–0.35 s); at speed 3 it is 20 or 25 ticks (~0.17–0.22 s). The average game-time spacing stays the same.

Speeds (`SettingSpeed`):

| Button | `speed` | `speed_effect` | Full 24 h day at 23 fps |
|---|---|---|---|
| 1 | 1 | 1 | ~9.4 min |
| 2 | 2 | 3 | ~3.1 min |
| 3 | 3 | 5 | ~1.9 min |

Pause (`btn_pause`) stops the main loop. Many dialogs auto-pause. `animeDay` also stops the clock during the day transition.

> **Important for the remake:** the original clock is tied to rendered frames. If the SWF drops below 23 fps, game time slows down. Godot should use a fixed accumulator at **540 counter ticks per game hour**, firing the AI tick every time the counter crosses a multiple of **23**, so neither the clock nor the AI depends on rendering performance.

### 3.3 Day counter

- Internal `day` starts at **0**.
- It becomes **1** when the tutorial starts (`FirstCallNextDay()`).
- The HUD shows `"DAY " + day` (`navigator3.setDay()`).
- The first end-of-day report happens at midnight after day 1. It is not shown for day 0. Because the clock starts at 08:00, **day 1 is only 16 game hours long** (~6 min 15 s at speed 1); later days are a full 24 hours (~9 min 23 s).
- `FromDataRecord()` reconstructs the clock as `hour = day * 24`. For a save written at the end of day N this is the midnight boundary **after** day N (00:00 of day N+1), but `day` still holds N until the report is closed. The original immediately shows the end-of-day report for day N, then `continueDayGame()` increments to N+1. Saves are normally written at that exact boundary.
