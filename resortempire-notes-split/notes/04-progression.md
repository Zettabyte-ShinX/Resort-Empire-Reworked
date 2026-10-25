# RP, stars, unlocks, missions, achievements rules

> Part of the Resort Empire remake notes. Section numbers match the original NOTES.md, so cross-references like "see 8.4" or "§14.1" point to the file listed in `NOTES.md`.

## 7. Progression: RP, stars, unlocks, missions, achievements

### 7.1 Research Points (RP)

`RP` is recomputed as:

```text
RP = totalRP.Scenery + totalRP.Tile + totalRP.Khusus + totalRP.Facility
   + totalRP.Room + totalRP.Lobby + totalRP.JanitorRoom
   + totalRP.Janitor + totalRP.Mobil
```

RP sources:

- Building booths (first build of a type, and some additional builds).
- Upgrading booths (`RP_upgrade` array).
- Placing scenery and tiles.
- One-shot “special” actions in `RP_khusus` (clicking visitors, destroying objects, rotating, opening legend/tips, hiding buildings, etc.).
- Janitors (hire/promote).
- Mission/achievement/star bonuses (some go to `totalRP.Khusus`).
- Cars (`Mobil`).

The HUD shows `RP / batasRP` and a 0–100% progress bar toward the next star. The progress inside the current star is `RP_persenFix`.

### 7.2 Stars

`ResearchPoint.level_ = [50, 170, 340, 630, 1090, 1500, 2250, 3500, 6500, 10000, 14000]`.

| Star | RP required | Bonus money | Bonus RP |
|---|---|---|---|
| 0 | 0 | — | — |
| 1 | 50 | $500 | 5 |
| 2 | 170 | $700 | 10 |
| 3 | 340 | $1,200 | 15 |
| 4 | 630 | $1,900 | 25 |
| 5 | 1,090 | $3,100 | 40 |
| 6 | 1,500 | $5,000 | 60 |
| 7 | 2,250 | $8,100 | 100 |
| 8 | 3,500 | $13,100 | 175 |
| 9 | 6,500 | $21,200 | 300 |
| 10 | 10,000 | $34,300 | 500 |
| 11 | 14,000 | $55,500 | 750 |

On star-up:

- Money is added immediately (`updateRealTime("money", bonusLevel, "bonus")`).
- `bonusRP` is added to `game.totalRP.Khusus` and can immediately push you toward the next star.
- The `uplevelD` popup shows the reward.
- Unlocks tied to the new star are processed (`Unlocked["level_" + star]`).
- Plants are re-checked.

### 7.3 Unlocks

**Booths:**

- Start: Lobby (fixed), Cottage, Sauna, Icecream, JanitorRoom.
- Star 5: **Lodge** and **Expand 1**.
- Star 8 + already expanded once: **Expand 2**.
- All other booths are unlocked by buying the matching **Extra Upgrade** (section 8.4). This is easy to miss: the star gates the upgrade, and the upgrade unlocks the booth.

**Plants:**

`unlockedPlant()` requires BOTH:

- `star >= unlocked_level`
- `RP_persenFix >= unlocked_persen`

| Plant | Star | RP progress threshold |
|---|---|---|
| 1 Canna | 0 | 0% |
| 2 Pinellia | 0 | 0% |
| 3 Windmill Palm | 0 | 0% |
| 4 Bamboo Tree | 0 | 50% |
| 5 Cedar Tree 1 | 1 | 5% |
| 6 Cedar Tree 2 | 1 | 75% |
| 7 Palm Tree | 2 | 15% |
| 8 Maple Tree | 3 | 0% |

Each plant unlock also awards **+1 RP** (`totalRP.Khusus`).

### 7.4 Expansions

| Level | Map | Land | Price |
|---|---|---|---|
| 0 | 37×37 | 16×16 | — |
| 1 | 43×43 | 22×22 | $20,000 |
| 2 | 50×50 | 29×29 | $125,000 |

`Expand 1` is unlocked at star 5. `Expand 2` requires `EXPAND >= 1` and star 8. Buying expansion rebuilds the map (`MapContainer.acceptExpanding`) and can change pathfinding/depth.

### 7.5 Missions

- 94 missions, stored as `game.Missions` in the exact order of `serbi.Mission.listing`.
- `Mission_Temp` is a queue of uncleared missions. **Only the head of the queue is evaluated**; the HUD shows one mission at a time.
- When it is cleared, the bonus is paid automatically, the mission is shifted off, and the next one is shown.
- `complete_mission` checks `misi_complete >= 93` (not 94), so it can be completed when the other 93 are done even though its displayed `batas` is 94.
- Mission bonuses total a significant part of the economy; see Appendix A.

### 7.6 Achievements

15 achievements plus `completed`. Each is one-shot, pays money and RP. See section 8.5 for the table.

- `acv_credit` is triggered by opening the credits.
- `acv_goodResort` / `acv_loveBeingHere`: popularity + happy visitor percentage.
- `acv_goodResearch`: 10 booth upgrades.
- `acv_growingResort`: 10 unlocked booths.
- `acv_rookieResort`: 10 visitors inside.
- `acv_famousResort`: all special visitors have visited.
- `acv_marvelousResort`: all 19 unlockable booth types — the 17 entries in `dataOb.listing` plus Cottage and Lodge. Lobby and JanitorRoom are excluded from the count even though they are booth types.
- `acv_grandResort`: 25 booths.
- `acv_awesomeContractor` / `acv_expertContractor`: expansion 1 / 2.
- `acv_superDev`: popularity 70% + all booth types.
- `acv_masterDev`: popularity 100% + Expert Contractor. No achievement count is checked.
- `acv_greenBucks` / `acv_bagOfGold`: total money $250,000 / $500,000.

`complete_acv` (`Mission`) is satisfied when `game.ACV.completed` is true, which is set at **14 of 15** achievements.
