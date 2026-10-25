# All booth/scenery/tile/extra-upgrade/achievement tables

> Part of the Resort Empire remake notes. Section numbers match the original NOTES.md, so cross-references like "see 8.4" or "§14.1" point to the file listed in `NOTES.md`.

## 8. Buildings and items

### 8.1 Booths, rooms and facilities

All 21 types. **Build $** is `price[0] / price[1] / price[2]` (build, L2 upgrade, L3 upgrade). **Fee** is per use for facilities, per night for rooms, random for mini-booths/minimarket. **Daily salary** already includes `sumStaff`. **Pop** is the build-time popularity range and the `+` bonuses added at L2/L3; the resort-wide booth total is multiplied by 0.6 and capped at 60.

| Type | Display name | Size | Build $ (L1/L2/L3) | Fee (L1/L2/L3) | Hours | XP/use | Daily salary | Pop base (+L2/+L3) | Unlocked by |
|---|---|---|---|---|---|---|---|---|---|
| Lobby | LOBBY RESORT | 2×4 | $0 / $10,000 / $20,000 | — | 24 h | 0 | $72 / $120 / $144 | 0–0 (+3 / +5) | start |
| Cottage | COTTAGE | 2×2 | $1,000 / $1,200 / $1,440 | $100 / $120 / $192 / night | 24 h | 10 | — | 0.5–1 (+1.55 / +2) | start |
| Lodge | LODGE | 3×2 | $2,500 / $3,000 / $4,000 | $250 / $300 / $480 / night | 24 h | 15 | — | 0.75–1 (+1.75 / +2.25) | star 5 |
| JanitorRoom | JANITOR'S ROOM | 1×1 | $300 / $500 / $800 | — | 24 h | 8 | — | 0.5–0.75 (+1.25 / +1.75) | start |
| Icecream | ICE CREAM | 1×1 | $750 / $0 / $0 | $3–9 (random) | 09:00–20:00 | 8 | $9 | 0.2–0.5 | start |
| Hotdog | HOTDOG | 1×1 | $800 / $0 / $0 | $3–10 (random) | 08:00–19:00 | 8 | $10 | 0.25–0.55 | wallpaper |
| Taco | TACO | 1×1 | $800 / $0 / $0 | $3–11 (random) | 12:00–23:00 | 8 | $14 | 0.3–0.6 | sauce |
| Giftshop | GIFTSHOP | 1×1 | $900 / $0 / $0 | $4–13 (random) | 13:00–22:00 | 8 | $15 | 0.4–0.7 | meat |
| Sauna | SAUNA | 2×2 | $1,200 / $1,440 / $1,920 | $24 / $29 / $77 | 06:00–20:00 | 5 | — | 0.15–0.25 (+0.5 / +0.75) | start |
| Gym | FITNESS CENTER | 2×2 | $1,500 / $1,800 / $2,400 | $30 / $36 / $96 | 06:00–21:00 | 5 | — | 0.15–0.25 (+0.5 / +0.75) | treadmill |
| Jacuzi | JACCUZI | 2×2 | $3,000 / $3,600 / $4,800 | $60 / $72 / $192 | 06:00–00:00 | 5 | — | 0.15–0.25 (+0.5 / +0.75) | heater |
| Arcade | ARCADE GAMEZONE | 2×2 | $4,000 / $4,800 / $6,400 | $80 / $96 / $256 | 10:00–21:00 | 5 | — | 0.15–0.25 (+0.5 / +0.75) | wine |
| Spa | SPA AND MASSAGE | 2×2 | $6,000 / $7,200 / $9,600 | $120 / $144 / $384 | 06:00–21:00 | 8 | $38 / $45 / $53 | 0.15–0.35 (+0.5 / +0.75) | towel |
| Pool | SWIMMING POOL | 4×3 | $9,000 / $10,800 / $14,400 | $180 / $216 / $576 | 06:00–00:00 | 20 | — | 0.3–0.6 (+0.75 / +1) | wifi |
| Golf | GOLF YARD | 4×4 | $12,000 / $14,400 / $19,200 | $240 / $288 / $768 | 06:00–17:00 | 8 | — | 0.4–0.75 (+0.85 / +1) | gardening |
| Bar | BAR AND LOUNGE | 2×2 | $2,500 / $3,000 / $4,000 | $50 / $60 / $160 | 17:00–05:00 | 8 | $30 / $36 / $42 | 0.15–0.25 (+0.5 / +0.75) | leaf |
| Minimarket | MINIMARKET | 3×3 | $8,000 / $9,600 / $12,800 | 5–150 / 6–192 / 7–450 (random) | 24 h | 8 | $31 / $39 / $43 | 0.3–0.6 (+0.75 / +1) | irrigation |
| JapanResto | JAPAN RESTAURANT | 2×2 | $5,500 / $6,600 / $8,800 | $110 / $132 / $352 | 15:00–22:00 | 8 | $18 / $22 / $25 | 0.15–0.25 (+0.5 / +0.75) | bamboo |
| BaratResto | WEST RESTAURANT | 2×2 | $6,000 / $7,200 / $9,600 | $120 / $144 / $384 | 14:00–21:00 | 8 | $18 / $22 / $25 | 0.15–0.25 (+0.5 / +0.75) | uniform |
| IndiaResto | INDIA RESTAURANT | 2×2 | $5,000 / $6,000 / $8,000 | $100 / $120 / $320 | 08:00–20:00 | 8 | $30 / $36 / $42 | 0.15–0.25 (+0.5 / +0.75) | palm |
| Medical | MEDICAL CENTER | 3×3 | $7,500 / $9,000 / $9,600 | $150 / $180 / $480 | 07:00–23:00 | 8 | $35 / $42 / $50 | 0.35–0.65 (+0.75 / +1) | aid |

Notes:

- Mini-booths (Icecream, Hotdog, Taco, Giftshop) only have **level-1 data**. Their `price[1]` and `price[2]` are 0. See 14.1 for the upgrade edge case.
- The Medical Center’s L3 price ($9,600) is only **$600 above** its L2 price ($9,000), far below the usual L3 jump. Preserved as data; likely a missing zero in the original.
- Mini-booth fees are a random integer between the two values, capped by the visitor’s remaining cash.
- Minimarket fees are special. On load its `booked_price` field is overwritten with `4 + level` (the minimum) and `max_price` with the JSON `booked_price[level−1]` (the maximum). Each sale is a random integer in that range, capped by the visitor’s cash. The sale also sets `persen_usedtimer` — `cost < 0.3 × max_price` gives 10, otherwise `cost / max_price` — which scales how long the visitor stays in the shop (`initUsedTimer()`), so a cheap sale shortens the visit.
- `xpt` is the XP awarded per use (rooms: per checkout; lobby: 0).
- XP thresholds to upgrade are `Exp[level]`: for a 3-level booth, L1→L2 needs `Exp[1]`, L2→L3 needs `Exp[2]`. Example Cottage: 12 then 28. Lobby: 350 then 1,000. Janitor’s Room upgrades ignore XP and only need money.
- Daily salary is only charged for booths with staff; rooms do not have staff.
- `RP_upgrade` per level (not shown) is: most facilities `[0, 3, 7]`; Spa and BaratResto `[0, 4, 7]`; Lobby `[0, 6, 10]`; Cottage `[0, 3, 8]`; Lodge `[0, 4, 9]`; Pool `[0, 6, 9]`; Golf `[0, 8, 10]`; Medical/Minimarket `[0, 5, 8]`; JanitorRoom `[0, 1, 2]`.
- Booth `drainpop` (full-popularity count before diminishing returns): Lobby 1; rooms 5; JanitorRoom 3; most facilities 2; Medical 1; mini-booths 3; Golf/Pool 2.

### 8.2 Scenery

Buyable plants:

| ID | Name | Price | Popularity | Unlock star | RP progress |
|---|---|---|---|---|---|
| 1 | CANNA | $35 | 0.06 | 0 | 0% |
| 2 | PINELLIA | $40 | 0.07 | 0 | 0% |
| 3 | WINDMILL PALM | $40 | 0.08 | 0 | 0% |
| 4 | BAMBOO TREE | $50 | 0.09 | 0 | 50% |
| 5 | CEDAR TREE 1 | $75 | 0.105 | 1 | 5% |
| 6 | CEDAR TREE 2 | $90 | 0.115 | 1 | 75% |
| 7 | PALM TREE | $90 | 0.14 | 2 | 15% |
| 8 | MAPLE TREE | $100 | 0.155 | 3 | 0% |

Technical scenery entries:

- `PLANT_0` = empty.
- `PLANT_99` = corner plant decoration.
- `PLANT_9`–`PLANT_17` = “ACC” accessories (price 0, no popularity), used for map decoration / tutorial.

Plants can only be placed on **grass** tiles (`plenty = true`), not on walkable path tiles.

### 8.3 Tiles

Player-buyable tiles:

| ID | Name | Price | Popularity | Walkable | Plantable |
|---|---|---|---|---|---|
| `TILE_1`–`TILE_4` | TILE 1–4 (floor variants) | $25 | 0 | yes | no |
| `TILE_5` | GRASS (NO CORNER) | $35 | 0.035 | no | yes |
| `TILE_6`–`TILE_13` | GRASS 1–8 | $35 | 0.035 | no | yes |
| `TILE_82` | SIDEWALK TILE | $0 | 0 | yes | no |
| `TILE_83` | ASPHALT TILE | $0 | 0 | yes | no |

Technical/default tiles (not normal shop items):

| ID | Role |
|---|---|
| `TILE_0` | Empty / no tile |
| `TILE_15` | Internal “planted ground” frame (only `fr: 26`); used as a blitting overlay |
| `TILE_80` | Sand tile (decorative, plantable) |
| `TILE_81` | Corner tile |
| `TILE_93` | Outer/road tile |
| `TILE_94`–`TILE_96` | Lobby floor variants |
| `TILE_97` | Blocking tile (`HALANG`) |
| `TILE_98` | Dead-end/edge tile (`TEHEL`) |
| `TILE_99` | Temporary tile |

The sidewalk/asphalt are free but only reachable through the debug toolbar in the original build; normal players may not have a tile-drawing UI. Confirm whether they were meant to be player-facing.

### 8.4 Extra upgrades (Resort Upgrades)

These are bought from the **Extra** tab. Each one requires a star level, costs money, and **unlocks the booth named in the “Unlocks” column** (via `acceptPurchaseToGame`). This is the main gate for most facilities.

| Key | Name | Effect | Unlocks | Price | Star |
|---|---|---|---|---|---|
| `treadmill` | Secondhand Treadmill | Boost staff stamina | Gym | $1,500 | 1 |
| `leaf` | Garnish Leaf | Reduce cedar tree price (−10) | Bar | $2,800 | 2 |
| `wallpaper` | Wallpaper | Reduce palm tree price (−20) | Hotdog | $3,250 | 3 |
| `heater` | Water Heater | Boost visitor mood in Cottage | Jacuzi | $4,250 | 3 |
| `sauce` | Barbeque Sauce | Reduce bamboo tree price (−10) | Taco | $3,100 | 4 |
| `wine` | 80 Years Old Wine | Add extra tip earnings (all booths) | Arcade | $4,800 | 4 |
| `palm` | Palm Oil | Extra tip earnings at Lodge | IndiaResto | $4,500 | 5 |
| `towel` | Luxury Towel | Boost visitor mood in Lodge | Spa | $4,500 | 5 |
| `meat` | Minced Meat | Extra tip earnings at Hotdog | Giftshop | $3,500 | 6 |
| `bamboo` | Bamboo | Extra tip earnings at Cottage | JapanResto | $4,750 | 6 |
| `aid` | First Aid Kit | Boost old man/old lady mood | Medical | $4,950 | 6 |
| `uniform` | Cotton Uniform | Boost staff XP | BaratResto | $5,000 | 7 |
| `irrigation` | Premium Irrigation | Extra tip earnings at West Restaurant | Minimarket | $5,500 | 8 |
| `wifi` | Wi-Fi Access | Boost visitor mood | Pool | $5,750 | 9 |
| `gardening` | Ornamental Gardening | +0.1 popularity per plant; tiles get +0.1 twice (see note); scenery/tile popularity cap 10 → 15 | Golf | $6,500 | 10 |

`wine` is special: it is the only tip source that applies to **every** booth (including rooms). The room/food bonus that follows is capped by `min(base cap, visitor.money − wine tip)`, so wine only narrows the second bonus when the visitor is nearly out of cash — it is not subtracted from the cap in the usual case.

`gardening` has an asymmetry worth preserving: `updateSubScenery_popularity()` adds `0.1` to each plant’s `pop` once, while `updateSubTile_popularity()` adds `0.1` inside `_loc10_` and then again in `_loc6_ = (_loc10_ + param4) * count`, so each tile effectively gains `0.2` popularity. This looks like a typo in the original; decide per the bug policy in section 15.

### 8.5 Achievements

| Key | Name | Description | Bonus | RP |
|---|---|---|---|---|
| `acv_credit` | ENTER THE CREDIT | Nice to meet you! :) | $1,500 | 2 |
| `acv_goodResort` | GOOD RESORT | Popularity 17% + 50% visitors happy | $4,000 | 4 |
| `acv_loveBeingHere` | I LOVE BEING HERE | Popularity 50% + 75% visitor happy | $11,000 | 7 |
| `acv_goodResearch` | GOOD RESEARCH | 10 booths upgraded | $7,500 | 5 |
| `acv_growingResort` | GROWING RESORT | Unlock 10 booths | $5,000 | 4 |
| `acv_rookieResort` | ROOKIE RESORT | Have 10 visitors inside resort | $1,000 | 3 |
| `acv_famousResort` | FAMOUS RESORT | All special visitors visited your resort | $12,000 | 8 |
| `acv_marvelousResort` | MARVELOUS RESORT | Unlocked all booth types | $15,000 | 7 |
| `acv_grandResort` | GRAND RESORT | Have total 25 booths | $8,000 | 6 |
| `acv_awesomeContractor` | AWESOME CONTRACTOR | Expand Resort to level 2 | $10,000 | 8 |
| `acv_expertContractor` | EXPERT CONTRACTOR | Expand Resort to level 3 | $15,000 | 9 |
| `acv_superDev` | SUPER DEVELOPER | Popularity 70% + Build all booth types | $17,000 | 9 |
| `acv_masterDev` | MASTER DEVELOPER | Popularity 100% reached + Expert Contractor | $50,000 | 10 |
| `acv_greenBucks` | GREEN BUCKS | Have total money $250.000 | $60,000 | 10 |
| `acv_bagOfGold` | BAG OF GOLD | Have total money $500.000 | $70,000 | 10 |

Descriptions use periods as thousands separators in the original. `acv_masterDev` is triggered by popularity 100 + Expert Contractor; it does not require all 15 achievements. The separate `completed` flag is set at 14 of 15.
