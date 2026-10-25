# Money, income, expenses, salaries, subsidies

> Part of the Resort Empire remake notes. Section numbers match the original NOTES.md, so cross-references like "see 8.4" or "§14.1" point to the file listed in `NOTES.md`.

## 5. Money, income and expenses

### 5.1 Starting values

| Value | Start |
|---|---|
| Money | **$10,000** |
| Day | 1 |
| Clock | 08:00 |
| Star | 0 |
| RP | 0 |
| Map | 37×37 |
| Lobby | Level 1, free |
| Unlocked | Cottage, Sauna, Icecream, JanitorRoom (plus plants 1–3) |

### 5.2 Income

| Source | Amount / timing |
|---|---|
| Facility use | `booked_price[level-1]` per served visitor (fixed) |
| Mini-booths (Icecream, Hotdog, Taco, Giftshop) | Random between `booked_price[0]` and `booked_price[1]`, capped by visitor cash |
| Minimarket | Random between `min(cash, 4 + level)` and `min(cash, booked_price[level−1])` |
| Rooms | Visitor pays `nights × nightly_rate` on entering the room; the resort receives it at lobby checkout |
| Tips | Only through tip-granting extras (see 6.4) |
| Mission bonus | Automatic on completion |
| Achievement bonus | Automatic on unlock |
| Star-up bonus | Money + RP, see 7.2 |
| Facebook like | **$5,000 + 10 RP** per button, once per session, local only |
| Deficit subsidy | $3,000 (first time) / $5,000 (later), see 5.5 |

All income is added through `updateRealTime("money", +amount, category)` and tracked in `game.MISC.Income`.

### 5.3 Expenses

| Sink | Amount / timing |
|---|---|
| Build booth | `price[0]` |
| Upgrade booth | `price[level]` (L1→L2 uses `price[1]`, L2→L3 uses `price[2]`) |
| Hire janitor | `JanitorRoom.hire_price[current_count]` (150 / 210 / 250) |
| Promote janitor | `Employee.Janitor.price[level]` (100 / 200) |
| Expand resort | $20,000 / $125,000 |
| Extra upgrade | See table in 8.4 |
| Staff salaries | Deducted at end of day (`reportEndDay`) |
| Janitor salaries | Deducted at end of day |
| Scenery / tiles | `price` per object |

### 5.4 Salaries

Booth staff (`Booth.as`):

```text
daily_gaji = REF.salary[level_ - 1] * REF.sumStaff
StaffSalary += daily_gaji   // once per booth; simpanGaji guards double-add
```

- Only booths with `sumStaff > 0` pay: Lobby (2 staff), Bar, Medical, Minimarket, Spa, JapanResto, BaratResto, IndiaResto, and the four mini-booths.
- The table in section 8.1 shows the **total daily salary** (already multiplied by `sumStaff`).
- Salaries are recalculated when the booth is upgraded.
- The Lobby has `sumStaff = 2`, so its listed base `salary` is doubled: **$72 / $120 / $144** per day.

Janitors (`Janitor.as`):

```text
daily_gaji = room.gajiPokok_janitor + Employee.Janitor.gaji_pokok[room.level_ - 1]
JanitorSalary += daily_gaji
```

- Per janitor: **$20 / $30 / $40** per day depending on Janitor’s Room level.
- The room’s own `gaji_pokok` (15 / 20 / 25) is the first term; the employee table (5 / 10 / 15) is the second.
- Firing removes the salary and may refund nothing.

At midnight, `reportEndDay()` subtracts `StaffSalary + JanitorSalary` once. This is the only recurring expense.

### 5.5 Negative money and subsidies

There is no bankruptcy.

- If money < 0 at day start, `isDefisit` becomes true and `day_defisit` counts.
- If the deficit persists long enough (`day_defisit >= kali_defisit * 2`, `kali_defisit < 4`), a subsidy is offered:
  - first time: **$3,000**
  - later: **$5,000**
- If `kali_defisit > 3`, the message panel changes and `moneyD` forces a stronger warning, but the game continues.
- The original can therefore be played into permanent negative money; salaries keep being deducted.

### 5.6 End-of-day report

`statD` / `StatIsi` shows:

- Day number
- Total earnings / loss for the day
- Current balance
- Visitor count
- Breakdown by Lobby, Facility, Room, Scenery, Tiles, Extra, Expand, Janitor, Misc, Bonus

The report is shown every day because `alwaysShowReport = true` by default. The player can toggle “always show report” (`btn_alwaysReport`).
