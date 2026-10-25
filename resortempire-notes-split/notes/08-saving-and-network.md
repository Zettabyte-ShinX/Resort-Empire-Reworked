# Save format and server/external dependencies

> Part of the Resort Empire remake notes. Section numbers match the original NOTES.md, so cross-references like "see 8.4" or "§14.1" point to the file listed in `NOTES.md`.

## 12. Saving and loading

### 12.1 Storage

The game uses a single Flash `SharedObject`:

```as3
public var myCookies:SharedObject = SharedObject.getLocal("dataq");
```

- Local only; no server, account or cloud copy.
- One slot. `ClearData()` calls `myCookies.clear()`.
- No encryption, checksum or integrity check. The save is editable by anyone who can access the Flash local storage.
- `myCookies.flush(myCookies.size)` is called after writing.
- The debug HUD shows the current byte size (`navigatorX.size_t`).

### 12.2 What is stored

`gameRecord` is a deep copy of the mutable game state, built by `NeedToGameRecord()`:

| Group | Fields |
|---|---|
| Identity | `game_version`, `playerName`, `day` |
| Core progress | `money`, `star`, `EXPAND`, `Cottage_booked`, `Lodge_booked` |
| Economy | `MISC`, `SUM`, `ID`, `popularity`, `totalRP`, `RP_khusus`, `RP_createData` |
| Unlocks | `UNLOCKED`, `UNLOCKED_new`, `EXTRA`, `ACV`, `specialVisitor` |
| World | `objects.Lobby`, `objects.Scenery`, `objects.Facility`, `objects.Cottage`, `objects.Lodge`, `objects.Mobil`, `objects.JanitorRoom`, `tiles` |
| People | `visitors`, `janitors`, `sampah` |
| Systems | `Missions`, `Tips`, `notif`, `TempData` |
| Deficit state | `isDefisit`, `day_defisit`, `kali_defisit` |

Tutorial progress is **not** a save field. `CallProgram()` sets `endTutorial = day != 0`, so loading any save after the first day skips the tutorial. A top-level `endGuide` may exist in saves migrated from version 0, but no current code writes or reads it.

Transient things such as the current frame, pathfinding queues, HUD visibility and sound volume are not saved. Visitors are saved mid-stay, so loading can resume with guests already inside.

### 12.3 When it saves

There is **no save button and no autosave during the day**.

| Trigger | Behaviour |
|---|---|
| End of day | `closingStatFunction()` calls `autoSavedDataCalling()` when the day report closes, unless `alwaysShowReport` is off; then it saves directly |
| Manual debug save | `navigatorX` “save” calls `SaveData()` |
| New Game | `ClearData()` erases the old slot before starting |
| Exit to menu | **No save**; anything since the last end-of-day is lost (the confirmation only warns about leaving) |
| Browser/tab close | **No save** |

This is a significant difference from most tycoon games. A remake that autosaves on quit will be friendlier, but it will not reproduce the original’s “lose the current day” behaviour.

### 12.4 Loading

`CheckLocalData()` reads `myCookies.data.gameRecord` at menu start and sets `adaSave`, `playerName`, `day` and `money`. `loadDataGame(true)` then calls `FromDataRecord()`.

Important details:

- The clock is reconstructed as `hour = day * 24` and `counter = CounterHour(hour)`. Because saves are written at the end of a day, this is the **midnight boundary after the saved day**, not the time of the previous save.
- `ShowFirstReport()` immediately shows the end-of-day report for the saved day. Closing it increments `day` and continues from that midnight boundary (now 00:00 of the new day).
- `FromDataRecord()` reorders saved missions to match the current `serbi.Mission.listing` order. This protects old saves when mission order changes.
- If `gameRecord.TempData` is absent, `CreateTempData_baruBuat()` rebuilds the name pools.
- A manual mid-day debug save is loaded the same way: the clock jumps to the day boundary, the report is shown, and closing it advances to the next day. The remainder of the saved day is lost.
- `updateVersion()` migrates older saves. The current version is **1.1**. A pre-1.0 save has object references stripped and `endGuide` moved; for version numbers ≥ 1.1 and < 1.11, `Missions.x_earn` is renamed to `x_money`.
- The save does not store a separate “current time”; only `day` is stored. Time-of-day progress within the day is lost on exit.

### 12.5 Save size and risks

- Size grows with placed objects, visitors, janitors and trash. The debug HUD exists partly to watch this.
- Flash `SharedObject` has a per-domain limit (typically 100 KB unless the user allows more); the original relies on staying under it. Long saves with many objects can approach the limit.
- A corrupted or partially written `gameRecord` is not validated. There is no backup slot.
- For the remake, a JSON save with a small schema version, an atomic write (`.tmp` then rename), and optional multiple slots would be safer — but it would not be byte-compatible with the original.

## 13. Server and external dependencies

The game is effectively **offline**. It has no account system, no cloud save, no multiplayer, no ads, no in-app purchases and no server-side economy.

### 13.1 Analytics tracker

`Main.frame1()` does one POST on startup, but only when the SWF is **not** loaded from a `file:` URL:

```as3
if (loaderInfo.url.substring(0, 4) != "file") {
    Security.allowDomain("*");
    Security.loadPolicyFile("http://track.g-bot.net/crossdomain.xml");
    variables2.id = "resortempire";
    variables2.ui = loaderInfo.url;
    request2 = new URLRequest("http://track.g-bot.net/track.php");
    request2.method = "POST";
    request2.data = variables2;
    loader2 = new URLLoader();
    loader2.load(request2);
}
```

| Detail | Value |
|---|---|
| Endpoint | `http://track.g-bot.net/track.php` |
| Method | POST |
| Fields | `id=resortempire`, `ui=<SWF URL>` |
| Response | Ignored |
| Policy file | `http://track.g-bot.net/crossdomain.xml` |
| Local files | Skipped entirely |
| HTTPS | No; plain HTTP |

This is a page-view/piracy tracker, not gameplay telemetry. It sends no save data, player name, money or progression.

### 13.2 Links opened by the player

| Trigger | URL |
|---|---|
| Sponsor splash / More / sponsor button | `http://www.gamesfree.com/` |
| Developer button / context menu | `http://www.littlegiantworld.com/` |
| Follow → sponsor Facebook | `http://www.facebook.com/pages/Games-Free/112783725420705/` |
| Follow → developer Facebook | `http://facebook.com/Littlegiantworld/` |
| Credits → YouTube | `http://www.youtube.com/user/LittleGiantWorld` |

The Facebook links are the only ones with an in-game reward: `gotoSponsorFB(true)` and `gotoDeveloperFB(true)` each add **$5,000** and **10 RP**, then hide the corresponding button for the rest of the session. `game.likeSponsor` / `game.likeLG` are **not** part of `NeedToGameRecord()`, so the buttons reappear after reloading and the bonus can be claimed again. This is a local reward, not a verified Facebook action; the code grants it as soon as `navigateToURL` does not throw.

### 13.3 Hidden host check

`Main` sets `url_hack = true` if the SWF host string contains `"hack"`. After day 4, `Application` shows the `betaD` panel when this flag is true. A `sitelock()` function and an allow-list (`game.gamesfree.com`) exist, but `sitelock()` is never called, so there is no real domain lock.

### 13.4 What a remake needs

- No server is required for single-player.
- The tracker should be dropped.
- Social links and their $5,000/10 RP rewards are optional; if kept, they need a clear one-time claim and should not depend on a browser popup succeeding.
- Save data should remain local JSON, as the project brief requires. There is no original online save format to preserve.
