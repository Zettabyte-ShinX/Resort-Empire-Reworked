import assert from "node:assert/strict";
import { test } from "node:test";

import { World } from "../src/core/world.ts";
import { gridToScreen, screenToGrid } from "../src/core/iso.ts";
import { findPath } from "../src/core/pathfind.ts";
import { DATA, MAP_TIERS, boothPrice } from "../src/core/data.ts";

/** A mask where every tile is walkable. */
function openMask(cols: number, rows: number): Uint8Array {
  return new Uint8Array(cols * rows).fill(1);
}

test("isometric transforms round-trip", () => {
  for (let col = 0; col < 20; col++) {
    for (let row = 0; row < 20; row++) {
      const p = gridToScreen(col, row);
      const g = screenToGrid(p.x, p.y);
      assert.ok(Math.abs(g.col - col) < 1e-9, `col ${col} -> ${g.col}`);
      assert.ok(Math.abs(g.row - row) < 1e-9, `row ${row} -> ${g.row}`);
    }
  }
});

test("pathfinding finds a route across open ground", () => {
  const path = findPath({ col: 0, row: 0 }, { col: 10, row: 5 }, {
    mask: openMask(37, 37),
    bounds: { cols: 37, rows: 37 },
  });
  assert.ok(path, "expected a path");
  const last = path[path.length - 1]!;
  assert.deepEqual(last, { col: 10, row: 5 });
});

test("pathfinding returns null when the goal is walled off", () => {
  // A full column of blocked tiles must sever the map in two.
  const mask = openMask(37, 37);
  for (let r = 0; r < 37; r++) mask[r * 37 + 5] = 0; // wall down column 5
  const path = findPath({ col: 0, row: 0 }, { col: 10, row: 5 }, {
    mask,
    bounds: { cols: 37, rows: 37 },
  });
  assert.equal(path, null);
});

test("pathfinding is fast enough to run every frame on a real map", () => {
  const mask = openMask(37, 37);
  for (let r = 0; r < 37; r++) mask[r * 37 + 18] = 0; // wall down column 18
  const started = Date.now();
  for (let i = 0; i < 200; i++) {
    // A reachable goal: this is the case the game hits over and over.
    findPath({ col: 2, row: 2 }, { col: 15, row: 30 }, { mask, bounds: { cols: 37, rows: 37 } });
  }
  const elapsed = Date.now() - started;
  // 200 searches must stay well inside a single frame budget.
  assert.ok(elapsed < 1000, `200 path searches took ${elapsed}ms`);
});

test("a busy resort simulates fast enough for 60fps", () => {
  const w = new World({ tier: 0, startingMoney: 200000 });
  let placed = 0;
  for (const type of ["Cottage", "Lodge", "Pool", "Gym", "Spa", "Sauna", "Jacuzi", "Arcade", "Golf", "Icecream", "Hotdog", "Taco", "Bar"]) {
    for (let r = 4; r < 30 && placed < 13; r += 3) {
      for (let c = 4; c < 30 && placed < 13; c += 4) {
        if (w.placeBooth(type, c, r)) {
          placed++;
          break;
        }
      }
    }
  }
  assert.ok(w.booths.length >= 10, "expected a busy resort");

  // Warm up, then measure the median frame time. The median is the honest
  // number on a shared machine; the tail is dominated by GC and scheduler
  // noise rather than by the simulation.
  for (let i = 0; i < 600; i++) w.update(1 / 30);
  const frames: number[] = [];
  for (let i = 0; i < 900; i++) {
    const t = performance.now();
    w.update(1 / 30);
    frames.push(performance.now() - t);
  }
  frames.sort((a, b) => a - b);
  const median = frames[Math.floor(frames.length / 2)]!;
  assert.ok(median < 4, `median frame was ${median.toFixed(3)}ms, too slow`);
});

test("pathfinding gives up quickly on an unreachable goal", () => {
  const started = Date.now();
  const mask = openMask(37, 37);
  for (let r = 0; r < 37; r++)
    for (let c = 0; c < 37; c++)
      if (!(c < 5 || r < 5)) mask[r * 37 + c] = 0;
  const path = findPath({ col: 0, row: 0 }, { col: 30, row: 30 }, {
    mask,
    bounds: { cols: 37, rows: 37 },
    maxNodes: 5000,
  });
  assert.equal(path, null);
  assert.ok(Date.now() - started < 2000, "search must not stall the frame");
});

test("a new world starts with a starter resort and full funds", () => {
  const w = new World({ tier: 0, startingMoney: 20000 });
  assert.equal(w.money, 20000);
  assert.equal(w.booths.length, 4);
  assert.equal(w.tiles.length, w.rows);
  assert.equal(w.tiles[0].length, w.cols);
});

test("placing a facility costs money and occupies its footprint", () => {
  const w = new World({ tier: 0, startingMoney: 5000 });
  const before = w.money;
  const booth = w.placeBooth("Cottage", 5, 5);
  assert.ok(booth);
  assert.equal(w.money, before - boothPrice("Cottage", 0));
  assert.equal(w.tiles[5][5].booth, "Cottage");
  assert.equal(w.tiles[6][6].booth, "Cottage");
  // Overlapping placement must be rejected.
  assert.equal(w.placeBooth("Cottage", 5, 5), null);
});

test("facilities cannot be placed outside the map", () => {
  const w = new World({ tier: 0 });
  assert.equal(w.placeBooth("Pool", w.cols - 1, w.rows - 1), null);
});

test("the simulation runs, guests arrive and money changes hands", () => {
  const w = new World({ tier: 0, startingMoney: 20000 });
  const startMoney = w.money;
  let sawGuest = false;
  for (let i = 0; i < 4000; i++) {
    w.update(1 / 30);
    if (w.visitors.length > 0) sawGuest = true;
  }
  assert.ok(sawGuest, "expected guests to arrive");
  assert.ok(w.money !== startMoney, "expected revenue");
  assert.ok(w.visitors.length <= w.guestCapacity, "capacity must be respected");
});

test("the clock advances and wraps around the day", () => {
  const w = new World({ tier: 0 });
  for (let i = 0; i < 4000; i++) w.update(1 / 30);
  assert.ok(w.day >= 1);
  assert.ok(w.hour >= 0 && w.hour < 24);
});

test("data tables are populated", () => {
  assert.ok(Object.keys(DATA.tiles).length > 20);
  assert.ok(Object.keys(DATA.booths).length > 15);
  assert.ok(DATA.sceneryListing.length >= 8);
  assert.equal(MAP_TIERS.length, 3);
});



