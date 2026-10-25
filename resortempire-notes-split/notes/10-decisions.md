# Open decisions for the remake

> Part of the Resort Empire remake notes. Section numbers match the original NOTES.md, so cross-references like "see 8.4" or "§14.1" point to the file listed in `NOTES.md`.

## 15. Open questions / decisions needed

These are the points where the original is ambiguous, internally inconsistent, or technically unsuitable for the target platforms. I have not guessed at them in the notes. The “default” column is what I would do if you do not care about a particular item.

| # | Question | Why it matters | Default if unanswered |
|---|---|---|---|
| 1 | **Bug policy:** preserve the $0 tips, free minibooth upgrades, 14/15 achievement clear and Medical L3 price exactly, or fix them? | Changes the economy and completion balance; the brief says “copy exactly unless I say otherwise” | Preserve exact behaviour in a `classic` rules mode; expose fixes as options later |
| 2 | **Resolution and frame rate:** keep 640 × 480 at 23 fps, or render at 1280 × 960 / 60 fps while simulating at the original tick rate? | Affects art, UI layout, camera, animation speed and weak-hardware performance | 60 fps rendering, fixed simulation at 540 counter ticks/game hour with the AI tick on each 23-tick boundary, integer-scaled 640 × 480 play area with letterboxing |
| 3 | **Aspect ratio:** strict 4:3, or widescreen with more map visible? | A widescreen camera changes how much of the resort the player sees and how the HUD is arranged | 4:3 play area, pillarboxed; add a widescreen camera option later |
| 4 | **Android input:** mouse/keyboard only, or touch pan/pinch/tap with no hover? | The original relies on hover tooltips, right-click-like inspectors and edge panning | Full touch support: drag to pan, tap to select, long-press for info, no hover-only actions |
| 5 | **Art:** reuse the extracted PNG/SVG frames, or redraw? | Reuse is fast but low-resolution and tied to the original’s 23 fps timing; redraw is a large art project | Reuse extracted art for the prototype, keep an asset abstraction so it can be replaced |
| 6 | **Save slots:** one save like the original, or multiple JSON slots with autosave? | The original loses the current day on exit and has one slot; multiple slots are friendlier but not faithful | Three slots, atomic JSON writes, autosave at day end and on quit |
| 7 | **Content scope:** ship all 94 missions, 15 achievements, 29 visitors and 21 booth types at launch, or stage them? | Affects how much data must be authored and tested before the first playable build | Data-driven full set; unlock missions in the original order, but allow testing via debug |
| 8 | **Online leftovers:** keep the tracker, sponsor links, Facebook rewards and `betaD`, or drop them? | Tracker is dead/unencrypted; social rewards are unverifiable and may violate store policies | Drop tracker and host checks; keep links as plain credits, no in-game rewards |
| 9 | **Language:** English only, or English + Indonesian? | Original UI text is English with Indonesian variable names and some mixed strings | English only first; keep all strings external for later localization |
| 10 | **Tutorial:** reproduce the full scripted 20-step tutorial, or a shorter optional one? | The original locks the player into a long first-run sequence and is easy to break | Reproduce the steps but make them skippable and replayable |
| 11 | **Time speed:** keep 1/3/5 multipliers and the 9.4-minute day, or rebalance? | Directly affects pacing on mobile and weak hardware | Keep 1/3/5 and the original day length; add pause when the app loses focus |
| 12 | **Visitor cap:** keep the original dynamic cap and spawn formula, or add a hard performance cap? | The original can spawn many visitors; low-end Android needs a bound | Keep formula, add a configurable hard cap and degrade spawn rate on low-end devices |
| 13 | **Multi-night stays:** keep the day > 1 + popularity > 7 + 81% rule, or allow multi-night bookings from day 1? | Day-1 guests currently book exactly one night; changing this alters early-game room income | Keep the original rule for classic mode |
| 14 | **`exports/` naming:** the brief and `AGENTS.md` say `/export`, but the actual folder is `exports/`. Should the remake docs and paths use `exports/`? | Prevents broken paths and confusion | Use `exports/`; optionally add a symlink or rename later |

The first four are the ones that most affect the architecture. The rest can be decided after a vertical slice.
