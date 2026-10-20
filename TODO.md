# Roadmap

Each item states what "done" means so it can be checked, not just felt.

## Now

- [x] **Extract the original's artwork** — every named clip in the SWF: ground
      tiles, sand floor, hedge, 22 facilities, 29 guests, facility floors,
      rooms, staff, guests inside facilities, construction progress, icons.
      *Done: 2433 PNGs in `public/art`, built by `tools/build_art_manifest.py`.*
- [x] **Reproduce the starting map** — the original builds the map itself in
      `MapContainer.BuildMap`: a sand plot anchored at a fixed corner, a ring
      of green hedge blocks with a gap for the gate, a sidewalk band and an
      asphalt road.
      *Verify: screenshot against the original running in Ruffle.*
- [x] **Modern interface** — top bar, tool rail, build palette, management
      panel, dialogs, facility inspector, autosave.
- [x] **Building models** — every facility is drawn with the original's own
      artwork: the floor plate from the `BoothTile` clip, the room from the
      `Wall` clip and the building from its own clip, each at the upgrade
      level the data records, lined up with the tiles it stands on.
      *Verify: a plot with every facility type, each with its own floor,
      room and staff.*
- [x] **Characters and their movement** — the 29 guest sprites with their
      walk and stand poses, facing the way they walk, plus the original's
      clips for guests using a facility and the staff working in one.
      *Verify: guests walk between tiles, turn, and sit in the cottage.*

## Next

- [ ] **Building site** — the original takes time to build a facility and
      shows its progress. *Verify: a facility under construction shows the
      original's scaffolding and the site is unusable until it is finished.*
- [ ] **Guest needs and mood** — guests want a room, food, fun or hygiene;
      unmet needs push mood down and drive the rating of the resort.
      *Verify: a guest that cannot reach a facility loses mood over time.*
- [ ] **Staff** — hiring, shifts, wages; the `sumStaff`/`salary` fields the
      original's data already specifies. *Verify: wages leave the account
      each day and facilities without staff run worse.*
- [ ] **Research and upgrades** — the extracted `ResearchPoint` tree, spendable
      in the interface. *Verify: points accrue and a purchase changes a
      facility's level.*
- [ ] **Rooms** — the original has rooms inside the facilities, with the
      `booth_selimutRoom` artwork and the room tab in the interface.
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
