# Original bugs and quirks (classic-mode rules)

> Part of the Resort Empire remake notes. Section numbers match the original NOTES.md, so cross-references like "see 8.4" or "§14.1" point to the file listed in `NOTES.md`.

## 14. Original quirks and likely bugs

These are behaviours confirmed in the decompiled source. They are separated into “likely bugs” and “odd but probably intentional” so the remake can decide deliberately rather than accidentally.

### 14.1 Likely bugs

| # | Quirk | Evidence | Effect |
|---|---|---|---|
| 1 | **Tips are $0 without a tip upgrade** | `Booth.addUangTip()` computes a cap from `visitor.REF.tip`, but only adds money inside `if (game.EXTRA.wine)`, `bamboo`/`palm` (rooms), `meat` (Hotdog) or `irrigation` (West Restaurant). With none owned, it returns 0 | The base `tip` value in `serbi` is a cap, not a guaranteed tip. Players who never buy a tip upgrade never see tips |
| 2 | **Minibooth upgrades are free** | Minibooths (`Icecream`, `Hotdog`, `Taco`, `Giftshop`) have price arrays such as `[750, 0, 0]`, `[800, 0, 0]` and `[900, 0, 0]`. `acceptLevelObject()` returns early for `minibooth`, so `up_price` is never assigned and stays `0`. `checkForUpgrade(1)` still allows level < 3 | After enough XP, the level-2 and level-3 upgrades cost **$0** |
| 3 | **Achievement completion is 14/15** | `countTotalAcv()` sets `game.ACV.completed = acv_complete >= 14`; `complete_acv` mission data says `batas: 15` | The “Achievements completed” mission can clear with one achievement still locked. The UI target says 15 |
| 4 | **Duplicate tip entry** | `serbi.Tips.listing` contains `upgradeBooth` twice (21 entries, 20 unique) | The tips dialog shows the same page twice; “new tip” state is keyed by the same object |
| 5 | **Medical Center level 3 is cheaper than expected** | `price: [7500, 9000, 9600]` | L2→L3 costs only **$600**, far below the usual L3 jump. Could be intentional, but it looks like a missing zero |
| 6 | **`complete_mission` looks off by one** | Check is `misi_complete >= 93` while the mission says 94 | This is actually correct for the active final mission: `misi_complete` counts only already-cleared missions, so 93 prior missions + the active 94th clears it. It is still confusing to read |

### 14.2 Odd but probably intentional

| Quirk | Detail | Remake note |
|---|---|---|
| One-night stays on day 1 | `Visitor.isRoomStay()` starts at 1 night; only day > 1 + popularity > 7 + an 81% roll allows the visitor's 2–3 night maximum | Day-1 guests still book rooms, but only for one night; this is pacing, not a lockout |
| Lobby salary is doubled | Lobby `sumStaff = 2`, so its daily salary is `salary[level − 1] × 2` | Explains why the Lobby costs more than its card suggests |
| No fail state | Negative money triggers subsidy offers, not bankruptcy | Subsidies: $3,000 first, $5,000 later; after 4 deficits the warning changes but play continues |
| Load starts at midnight | `FromDataRecord()` sets `hour = day * 24` | The report is shown immediately; the day then continues from 00:00 |
| No save on exit | Only end-of-day and the debug save write `dataq` | Current day is lost on “Exit” or browser close |
| Sponsor likes grant money | Each Facebook link gives $5,000 + 10 RP locally | Not verified server-side; the hide flag is not saved, so it resets on reload |
| `acv_credit` needs in-game credits | Opening credits from the main menu does not set it; opening from the in-game menu does | Easy to miss |
| Special visitor conditions | Ann: pop ≥ 10, star > 4, Lodge. Mr. Rock: pop ≥ 25, Medical. Naomi: pop ≥ 40, 2 Lodges. Robert: pop ≥ 50, star > 5, Minimarket, Lodge L2. Jason: pop ≥ 60, star > 5, Pool, 3 Lodges, Lodge L3 | Each special’s own stored `last_mood` must reach `MAX_MOOD` while absent, and its cooldown must expire |
| Star 11 extra unlock reset | `FromDataRecord()` clears `UNLOCKED_new.Extra` at star 11 | Cosmetic “new” badge cleanup |
| Internal tile `TILE_15` | Data is only `{"fr":26}`; it is the 26-frame ground overlay used to pre-render the map, not a purchasable tile | Do not expose it in the build menu |
| `boostMood` key in Booth data | `serbi.dataOb.Booth.boostMood` is a helper, not a booth | Do not treat every key under `Booth` as buildable |
| Fixed 23 fps simulation | `FR = stage.frameRate`; all timers are frame-based | At 60 fps a direct port would run ~2.6× too fast unless the tick is decoupled |
| `alwaysShowReport` default | `true`; the report appears every day | Turning it off saves directly at rollover |

### 14.3 Debug and leftover behaviour

| Item | Detail |
|---|---|
| `navigatorX` | Full debug HUD: save, clear, map coordinates, visitor info, force checkout, spawn trash, expansion, pathfinding |
| `btn_cheat` | Hidden main-menu button; each click adds $10,000 to `cheatPlus`, applied at game start |
| `url_hack` / `betaD` | Host string containing `hack` shows a hidden beta panel after day 4 |
| `sitelock()` | Exists with allow-list `game.gamesfree.com`, but is never called |
| `track.g-bot.net` | Page-view tracker; no gameplay data |
| `puffballPuzzles_fla` | Sponsor preloader animation, unrelated to resort gameplay |

### 14.4 Fidelity recommendation

The safest remake strategy is:

1. Reproduce the **observable economy** exactly, including the tip and minibooth quirks, behind a “classic” rules flag.
2. Fix only bugs that make the game unplayable or corrupt saves.
3. Keep a written list of every deliberate deviation, with the original formula next to it.
4. Decouple simulation from rendering early; the 23 fps assumption is the most likely source of “it feels wrong” bugs.
