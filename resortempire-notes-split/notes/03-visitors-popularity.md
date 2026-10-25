# Visitors, rooms, tips, popularity, janitors

> Part of the Resort Empire remake notes. Section numbers match the original NOTES.md, so cross-references like "see 8.4" or "§14.1" point to the file listed in `NOTES.md`.

## 6. Visitors, rooms, popularity and staff

### 6.1 Visitor types

`serbi.dataOb.Visitor` has 29 entries. 1–24 are regular, 25–29 are special. Generic visitors get a random name from `TempData.ListName`; couples are shown as “Mr/Mrs …”.

| # | Name | Sex | Cash | Max nights | Tip cap | Hygiene | Speed | Medical chance | Old |
|---|---|---|---|---|---|---|---|---|---|
| 1 | Visitor 1 | F | $5,000 | 2 | 4 | 3 | 1.15 | 35% | no |
| 2 | Visitor 2 | M | $5,000 | 2 | 3 | 2 | 1.00 | 40% | no |
| 3 | Visitor 3 | F | $6,500 | 2 | 2 | 4 | 1.80 | 29% | no |
| 4 | Visitor 4 | M | $7,000 | 2 | 3 | 1 | 1.20 | 25% | no |
| 5 | Visitor 5 | F | $8,000 | 2 | 2 | 5 | 2.00 | 25% | no |
| 6 | Visitor 6 | M | $8,800 | 2 | 3 | 3 | 1.50 | 30% | no |
| 7 | Visitor 7 | F | $9,250 | 2 | 4 | 5 | 0.95 | 45% | no |
| 8 | Visitor 8 | M | $9,500 | 2 | 5 | 1 | 1.50 | 45% | no |
| 9 | Visitor 9 | M | $9,800 | 3 | 4 | 2 | 1.40 | 45% | no |
| 10 | Visitor 10 | F | $10,000 | 3 | 5 | 2 | 1.35 | 45% | no |
| 11 | Visitor 11 | M | $11,000 | 2 | 2 | 2 | 0.75 | 95% | yes |
| 12 | Visitor 12 | F | $11,200 | 3 | 3 | 3 | 0.95 | 85% | yes |
| 13 | Visitor 13 | M | $12,500 | 3 | 2 | 2 | 0.60 | 90% | yes |
| 14 | Visitor 14 | F | $13,000 | 3 | 3 | 5 | 0.80 | 85% | yes |
| 15 | Visitor 15 | M | $9,500 | 2 | 4 | 2 | 0.75 | 90% | yes |
| 16 | Visitor 16 | F | $9,800 | 2 | 4 | 2 | 0.70 | 95% | yes |
| 17 | Visitor 17 | couple | $12,500 | 1 | 6 | 3 | 0.95 | 75% | no |
| 18 | Visitor 18 | couple | $13,000 | 3 | 5 | 4 | 0.95 | 45% | no |
| 19 | Visitor 19 | couple | $13,500 | 2 | 4 | 5 | 0.95 | 60% | no |
| 20 | Visitor 20 | couple | $13,700 | 3 | 5 | 4 | 0.95 | 55% | no |
| 21 | Visitor 21 | couple | $13,500 | 3 | 4 | 3 | 0.95 | 50% | no |
| 22 | Visitor 22 | couple | $14,550 | 3 | 6 | 2 | 1.00 | 90% | yes |
| 23 | Visitor 23 | couple | $14,500 | 3 | 7 | 1 | 0.95 | 95% | yes |
| 24 | Visitor 24 | couple | $15,000 | 2 | 4 | 1 | 0.70 | 98% | yes |
| 25 | **Ann Hat Away** | F | $17,000 | 3 | 12 | 5 | 0.80 | 75% | no |
| 26 | **Mr. Rock** | F | $18,500 | 3 | 13 | 5 | 1.40 | 90% | no |
| 27 | **Naomi Volts** | F | $20,000 | 3 | 14 | 5 | 0.95 | 75% | no |
| 28 | **Robert Fatinson** | F | $24,000 | 3 | 20 | 5 | 0.50 | 90% | no |
| 29 | **Jason State** | F | $25,000 | 3 | 15 | 5 | 1.35 | 80% | no |

Notes:

- “Max nights” is the visitor’s `room_stay`; the actual booking can be shorter if they cannot afford it.
- “Tip cap” is `REF.tip`; it is **not** automatically paid. See 6.4.
- “Medical chance” is `medical_prob`, used by old visitors.
- Sex `3` is a couple; the display name is “Mr/Mrs <couple name>”.
- Each visitor also has `likes.Room`, `likes.Room2`, `likes.Facility` (a list of 4–7 facilities plus weights) and `likes.Other`. The full arrays are in `serbi.as`; the UI uses them to choose destinations and mood boosts.
- Special visitors have `nick` names and use the same data shape; their arrival is conditional (6.6).

### 6.2 Visitor AI

`pack/Instance/Visitor.as` is the largest game class (~5,500 lines). High-level behaviour:

1. Spawn at a map entrance (on foot or by car).
2. Choose a destination list: room, facilities they like, food, medical, lobby checkout, etc.
3. Pathfind to the target; join that booth’s queue.
4. Wait, get served (or cancel), pay, gain/lose mood, then choose the next target.
5. At night, look for a room; if successful, stay one or more nights; otherwise leave.
6. Generate trash based on hygiene; react to nearby trash.
7. At the end, check out at the lobby and leave.

Mood (`mood`) is clamped to the visitor’s `MAX_MOOD` (1–4) and shown as a percentage (`persenMood = mood / maxMood * 100`). Mood changes from:

- Booth service (`boostMood.served` / `.canceled` in each booth’s data)
- Waiting in queue (`boostMood.antri`)
- Room quality / upgrades
- Trash nearby (`boostMood("sampah", …)`)
- Medical treatment
- Sleep / rest / stamina
- Special visitor bonuses

The smiley bands are global (`serbi.dataOb.Smiley`):

| Smiley | Range | Value |
|---|---|---|
| VERY HAPPY | 80–100 | +2 |
| HAPPY | 65–80 | +1 |
| NEUTRAL | 55–65 | 0 |
| UPSET | 35–55 | −1.5 |
| VERY UPSET | 0–35 | −2.5 |
| SLEEPY | — | 0 |

### 6.3 Room booking and checkout

`Visitor.isRoomStay(rate)` (`Visitor.as` around line 5471), called from `Booth.entering()` when the guest walks into the room:

```text
if room_stay != 0: already booked, return true

room_stay = 1
if day > 1 and popularity > 7:
    if random(100) > 19:                 // 81% chance
        max = (popularity < 10) ? 1 : visitor.room_stay
        for n = max down to 1:
            if n * rate < money:
                room_stay = n
                break
spending_temp = room_stay * rate
money -= spending_temp                  // visitor pays upfront
```

- Every room guest stays at least **1 night**. On **day 1**, or with popularity ≤ 7, the stay always remains 1 night.
- From **day 2** onward with popularity > 7, an 81% roll can extend the stay to the visitor type's `room_stay` (1–3). Popularity below 10 caps the result at 1 even if the roll succeeds.
- The visitor books the **maximum affordable number of nights**, up to that cap (`n * rate < money`, strict). If even one night fails that test, the visit is still charged as one night and the visitor's cash can go negative.
- Checkout condition: `dayStay - dayEnter >= room_stay`.
- At the lobby checkout the resort is credited `spending_temp` (nights × rate) plus any tip. The visitor’s money was already debited when it entered the room, so checkout is when the resort side of the ledger is booked — not when the guest pays.
- A room can only host one party at a time; it is marked booked/reserved.

### 6.4 Tips — important quirk

`Booth.addUangTip()` computes a cap:

```text
base = tip
cap  = mood > 80 ? base : (mood > 49 ? base - 1 : 1)
cap  = min(cap, visitor.money)
tip  = 0

if wine owned:
    tip += random(1, cap)               // "80 years old wine"
    cap  = min(cap, visitor.money - tip)

if checkout and (bamboo for Cottage or palm for Lodge):
    tip += random(1, cap)
else if Hotdog and meat owned:
    tip += random(1, cap)
else if BaratResto and irrigation owned:
    tip += random(1, cap)

return tip
```

**As written, the base tip is never added on its own.** A visitor with no relevant extra upgrade pays **$0 tip**, even at 100% mood. The `tip` field only acts as a cap for the random bonus. This looks like an original bug; it is confirmed by reading the only two call sites (`Booth.out` and `Lobby.queueProccessOut`) and there is no other tip path.

> For the remake, decide whether to preserve this or pay `base` plus the extra. Flagged in section 15.

### 6.5 Popularity

`countPopularity()` sums five contributions and clamps to **0–100**:

| Component | Formula | Cap |
|---|---|---|
| Scenery + Tile | `(Scenery + Tile) × 0.15` | 10 (15 with `gardening`) |
| Booths | `Booth × 0.6` | 60 |
| Janitor rooms | `JanitorRoom × 0.1` | 10 |
| Visitors | `ValueUser + RateOutResort` | 20 |
| Other (`Lain`) | accumulated | 4 / 7 / 10 by expansion level |

The displayed value is rounded to one decimal (`popularity_fix`).

Booth contribution details:

- Each booth gets a random popularity in `[pop[3], pop[0]]` only while fewer than `drainpop + EXPAND` booths of that type exist; later copies are built at the low `pop[3]` value.
- Upgrading adds `pop[level-1]` (`pop[1]` for L2, `pop[2]` for L3).
- The first `drainpop + EXPAND` booths of a type count fully; later ones count at 10% (or `level × 10%` for non-stand booths). This is the anti-spam rule.

Scenery/tile popularity:

- Each scenery has `pop` 0.06–0.155; each grass tile 0.035.
- The sum is multiplied by 0.15 and capped.
- `gardening` raises the cap from 10 to 15, adds +0.1 per plant and +0.2 per tile (the tile bonus is applied twice; see 8.4).

Visitor popularity:

- `ValueUser` grows when visitors are served and are happy; it is scaled by star (`star == 0` → ×0.0085, otherwise ×`star` × 0.02) and booth `pop`.
- `RateOutResort` is based on visitors who left without being served (`OutResort`, `ValueOutResort`), scaled by `pengaliValueUser()`.
- The visitor component is capped at 20.

### 6.6 Visitor cap and spawn chance

`hitungPopularity()` also computes `maxVisitor` from `popularity_fix`:

```text
pop < 1      -> 2..2
pop < 2      -> 3..5
pop < 6      -> 4..6
pop < 8      -> 4..7
pop < 10     -> 5..8
pop < 13     -> 6..9
pop < 17     -> 5..(pop*0.15)      // then forced to at least min+2
pop < 20     -> 8..(pop*0.25)
pop < 25     -> 9..(pop*0.35)
pop < 35     -> 11..(pop*0.45)
pop < 45     -> 14..(pop*0.65)
pop < 51     -> 17..(pop*0.75)
pop < 60     -> 19..(pop*0.8)
pop < 75     -> 20..(pop*0.85)
pop < 85     -> 20..(pop*0.9)
pop < 90     -> 20..(pop*0.95)
pop < 95     -> 20..pop
pop < 98     -> 20..95
pop < 100    -> 20..98
pop == 100   -> 25..101
```

Then:

- If `popularity_fix < 10` and the number of Cottages is greater than the rolled max, max += 2.
- If max < min, max = min + 2.
- `maxVisitor = random(min, max)` (integer).

`visitorFunction()` runs on every AI tick (`AFTER_TICK`) — about every 2.6 game minutes, or ~1 real second at speed 1:

```text
if visitors.length >= maxVisitor:
    continue only with 2% chance, and only if 3 <= popularity <= 60
if jeda_visitor > maxjeda_visitor:
    base = PROB_RANGE by hour
    rand = random(100)
    chance = base + popularity * 0.5
    if rand <= chance:
        if rand <= random(0.7..0.85) * base:   // same rand, not a second roll
            spawn a normal visitor (if under cap)
        else:
            spawn a "passing" visitor (newVisitor(true, ...))
        reset the gap
```

A “passing” visitor is created with `dummy = true`. It walks across the resort and leaves without entering booths, but it is still appended to `game.visitors`, so it temporarily counts against `maxVisitor` like any other guest. Also note that while the visitor count is at the cap the gap counter keeps incrementing; once a guest leaves, the next spawn attempt can fire immediately rather than waiting a fresh gap.

`PROB_RANGE = [50, 40, 30, 25, 15, 5]`, used as:

| Time | Base chance |
|---|---|
| 06:00–09:00 | 25 |
| 09:00–15:00 | 50 |
| 15:00–18:00 | 40 |
| 18:00–21:00 | 30 |
| 21:00–22:00 | 15 |
| 22:00–06:00 | 5 |

The gap between spawn attempts is random and shrinks with popularity (`reloadMaxJedaVisitor`). `jeda_visitor` is incremented once per `AFTER_TICK`, so the table’s first numeric column is a count of events, not minutes:

| Popularity | `maxjeda_visitor` (events) | Approx. game minutes |
|---|---|---|
| < 3 | 7–20 | 18–51 |
| 3–7 | 8–18 | 20–46 |
| 7–15 | 10–17 | 26–43 |
| 15–23 | 10–16 | 26–41 |
| 23–30 | 10–15 | 26–38 |
| 30–45 | 10–14 | 26–36 |
| 45–50 | 10–15 | 26–38 |
| 50–65 | 10–14 | 26–36 |
| 65–75 | 10–13 | 26–33 |
| 75–85 | 10–12 | 26–31 |
| 85–92 | `randomRange(10, 8)` — actually 9–10 | 23–26 |
| ≥ 92 | `randomRange(10, 7)` — actually 8–10 | 20–26 |

At speed 1 each event is ~1 real second, so the same numbers are also roughly the gap in real seconds; at speeds 2/3 the real-time gap is ~1/3 or ~1/5 as long. The game-time gap averages 23 ticks at every speed (≈2.56 game minutes); the exact spacing alternates between 21 and 24 ticks at speed 2 and between 20 and 25 ticks at speed 3.

The last two rows are literal calls with `min > max`. `co.randomRange()` is `floor(random × (max − min + 1)) + min`, so `(10, 8)` returns 9 or 10 and `(10, 7)` returns 8, 9 or 10. The intended “shorter gap at high popularity” never happens; above 85 the gap stays around 8–10 events. Preserve or fix per the bug policy.

### 6.7 Special visitors

Visitor25–29 only appear when conditions are met. `visitorSpecialFunction()` checks:

| Visitor | Conditions |
|---|---|
| 25 Ann Hat Away | popularity ≥ 10, star > 4, at least 1 Lodge |
| 26 Mr. Rock | popularity ≥ 25, at least 1 Medical Center |
| 27 Naomi Volts | popularity ≥ 40, at least 2 Lodges |
| 28 Robert Fatinson | popularity ≥ 50, star > 5, at least 1 Minimarket, a Lodge of level ≥ 2 |
| 29 Jason State | popularity ≥ 60, star > 5, at least 1 Pool, at least 3 Lodges, a Lodge of level ≥ 3 |

Additionally:

- The special’s `last_mood` must have grown to its `MAX_MOOD`. While the special is absent and its check runs, it grows by `1 / (MAX_MOOD * 50)` per AI tick (≈2.6 game minutes). Checks run from 06:00 to 22:00, so growth pauses overnight; reaching `MAX_MOOD` takes `MAX_MOOD × 50` events (100–200 for the five specials).
- `last_visit + add_day` must be less than the current day (cooldown).
- After a visit, `add_day` is rolled as 1–2 if mood > 50%, otherwise 2–3 and `last_mood` resets to 50% of max. The gate is `last_visit + add_day < day` (strict), so the next visit is actually possible **2–3 days** later in the first case and **3–4 days** later in the second. The strict comparison effectively adds one day; flag it in the bug policy.
- Only one instance of each special can be present at a time.

### 6.8 Hygiene, trash and janitors

- Each visitor has `hygiene` 1–5. `HYGIENE_RANGE.chance = [3, 2.5, 2, 1.5, 1]` percent per visitor `AFTER_TICK` event; trash count is random from `HYGIENE_RANGE.sampah[hygiene-1]` (1–3 items).
- Trash on a tile lowers the mood of visitors who walk over it (`boostMood("sampah", …)`).
- Janitors are hired per Janitor’s Room. Their daily salary is $20 / $30 / $40 by room level.
- Janitor’s Room cleaning area is **7×7 / 9×9 / 11×11** by level.
- Janitors have mood 1–3, stamina/sleep/break timers, work speed 1 / 1.5 / 2 by level, and can be promoted to level 3.
- The Janitor’s Room itself contributes popularity (`pop` 0.5–0.75 base, +1.25 / +1.75 on upgrades), and each room level adds a larger work area.
- `StaffSalary` and `JanitorSalary` are the only daily running costs.
