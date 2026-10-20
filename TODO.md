# Roadmap

Each item states what "done" means so it can be checked, not just felt.

## Now

- [x] **Extract the original's artwork** — ground tiles, sand floor, hedge, 22
      facilities, 29 guests, floor plates. *Done: 319 PNGs in `public/art`,
      built by `tools/build_art_manifest.py`.*
- [x] **Reproduce the starting map** — asphalt road, sidewalk, sand plot,
      hedge ring, scenery, from `MapContainer.as` and `zmap.as`.
- [x] **Modern interface** — top bar, tool rail, build palette, management
      panel, dialogs, facility inspector, autosave.
- [ ] **Building models** — every facility drawn with the original's art:
      its own floor plate (`blok` index), its wall overlay, and its
      animation frames played in sequence.
      *Done when:* all 22 facilities render on the plot at the right tile
      footprint, each shows its own floor, and a facility with several
      frames animates. *Verify:* screenshot of a plot with every facility
      type, plus a test that each facility's floor frame index matches the
      `blok` value in the extracted data.
- [ ] **Characters and their movement** — the 29 guest sprites with their
      walk cycles, moving in the right direction as they walk.
      *Done when:* guests walk between tiles using the original's frames
      (two-step cycle, mirrored by direction), stop when idle, and turn to
      face their target. *Verify:* screenshot of guests mid-walk in both
      screen directions, plus a test that the walk state advances the frame
      and flips on direction change.

## Next

- [ ] **Guest needs and mood** — guests want a room, food, fun or hygiene;
      unmet needs push mood down and drive the rating of the resort.
      *Verify:* a guest that cannot reach a facility loses mood over time.
- [ ] **Staff** — hiring, shifts, wages; the `sumStaff`/`salary` fields the
      original's data already specifies. *Verify:* wages leave the account
      each day and facilities without staff run worse.
- [ ] **Research and upgrades** — the extracted `ResearchPoint` tree, spendable
      in the interface. *Verify:* points accrue and a purchase changes a
      facility's level.
- [ ] **Audio** — the original's 5 background tracks and sound effects.
- [ ] **Tutorial** — a first-run guide, the original had `GuideDialog` and
      `GuideInGame`.

## Platforms (last)

- [ ] **Windows** — `.msi` and `.exe` from the same Tauri project.
- [ ] **Android** — APK/AAB, touch controls, smaller screen layout.
- [ ] **CI** — build all platforms on every push.

## Commercial

- [ ] Licensing position settled with LittleGiantWorld.
- [ ] Naming, branding and a store page.
- [ ] Monetisation for the mobile release.
