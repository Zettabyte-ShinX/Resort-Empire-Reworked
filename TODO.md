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
- [x] **Characters and their movement** — the 29 guest sprites with their
      walk and stand poses, facing the way they walk, plus the original's
      clips for guests using a facility and the staff working in one.
- [x] **The original's balance** — guest types with their budgets and the
      facilities they like, opening hours, staff wages, experience needed to
      upgrade a facility, and the research levels that unlock new ones.
- [x] **The original's sounds** — every sound the original plays, and the five
      background tracks.
- [x] **Walkable and unwalkable ground** — the plot of sand cannot be walked
      on. The guests reach a facility only when a path joins it to the gate,
      and a guest will not come into the resort at all until there is a room
      for it and that room is connected. A guest checks in at the lobby, goes
      to the room it was given, and then looks for something it likes.
- [x] **The original's extras** — the fifteen purchasable upgrades, each
      needing a research level and the facility it belongs to.
- [x] **The original's achievements and missions** — all of them, paying out
      money and research points as they are finished.
- [x] **The janitor** — the guests get dirty and leave rubbish behind, and a
      janitor room gets a janitor to pick it up.
- [x] **The resort can be expanded** — three sizes, each with a bigger plot
      and the land away from the gate.
- [x] **The special guests** — the last five guest types, who turn up now and
      then and bring a lot of money.
- [x] **Continuous integration** — the web build, the Linux app and the
      Windows app are built on every push.

## Next

- [ ] **Building site** — the original's site clips and scaffold are in place;
      its progress bar still has to be lined up with the site.
- [ ] **Rooms** — the rooms inside the facilities can take two guests, and the
      `booth_selimutRoom` artwork is only partly wired up.
- [ ] **The remaining guest animations** — the original has twenty thousand
      frames of guests using facilities; only the first of each is in.
- [ ] **The janitor's own staff** — the original has janitors as employees,
      with their own wage and stamina.
- [x] **Expanding a facility** — the original lets some facilities grow into
      a bigger plot.
- [ ] **Android** — APK/AAB, touch controls, smaller screen layout.

## Platforms

- [x] **Linux** — `.deb` and `.AppImage`.
- [x] **Windows** — `.msi` and `.exe`, built in CI.
- [ ] **Android** — APK/AAB, touch controls, smaller screen layout.
- [x] **CI** — the web build, the Linux app and the Windows app are built on
      every push.

## Commercial

- [ ] Licensing position settled with LittleGiantWorld.
- [ ] Naming, branding and a store page.
- [ ] Monetisation for the mobile release.
