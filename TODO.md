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
- [x] **The original's balance** — guest types with their budgets and the
      facilities they like, opening hours, staff wages, experience needed to
      upgrade a facility, and the research levels that unlock new ones.
- [x] **The original's sounds** — every sound the original plays, and the five
      background tracks.

## Next

- [ ] **Building site** — a new facility is a site first: the original's
      scaffold goes up on every tile and the facility opens when it is done.
      *Done for the scaffold and the timing; the original's progress bar
      still has to be lined up with the site.*
- [ ] **Rooms** — the original has rooms inside the facilities, with the
      `booth_selimutRoom` artwork and the room tab in the interface.
- [ ] **Research tree** — the `Extra_Upgrade` table: extras the player can
      buy with the research points.
- [ ] **Expanding the resort** — the original grows the plot as the resort
      is expanded, with the `Expand1` and `Expand2` unlocks.
- [ ] **Janitor** — the original has a janitor that cleans up, and a janitor
      room.
- [ ] **Tutorial** — a first-run guide, the original had `GuideDialog` and
      `GuideInGame`.
- [ ] **Achievements and missions** — the original's tables are extracted and
      can be wired up.

## Platforms (last)

- [ ] **Windows** — `.msi` and `.exe` from the same Tauri project.
- [ ] **Android** — APK/AAB, touch controls, smaller screen layout.
- [ ] **CI** — build all platforms on every push.

## Commercial

- [ ] Licensing position settled with LittleGiantWorld.
- [ ] Naming, branding and a store page.
- [ ] Monetisation for the mobile release.
