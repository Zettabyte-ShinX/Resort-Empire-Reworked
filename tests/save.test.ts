import assert from "node:assert/strict";
import { test } from "node:test";

import { World } from "../src/core/world.ts";
import { boothDef } from "../src/core/data.ts";
import { deserialize, serialize } from "../src/core/save.ts";

/** A free patch of ground inside the buildable plot, big enough for a facility. */
function freeSpot(w: World, type: string): { c: number; r: number } {
  const def = boothDef(type);
  const plot = w.plotBounds();
  for (let r = plot.r0; r + def.ROWS <= plot.r1; r++) {
    for (let c = plot.c0; c + def.COLS <= plot.c1; c++) {
      let free = true;
      for (let dr = 0; dr < def.ROWS && free; dr++) {
        for (let dc = 0; dc < def.COLS; dc++) {
          const t = w.tiles[r + dr]?.[c + dc];
          if (!t || t.booth || t.scenery) {
            free = false;
            break;
          }
        }
      }
      if (free) return { c, r };
    }
  }
  throw new Error(`no room for a ${type}`);
}

test("a saved resort round-trips", () => {
  const w = new World({ tier: 0, startingMoney: 20000 });
  w.money = 12345;
  w.researchPoints = 42;
  w.day = 7;
  w.hour = 14.5;
  w.stats.guestsServed = 9;
  const pool = freeSpot(w, "Pool");
  w.placeBooth("Pool", pool.c, pool.r);
  // Find a tile that is free of buildings and plants.
  let spot: { c: number; r: number } | null = null;
  for (let r = 0; r < w.rows && !spot; r++) {
    for (let c = 0; c < w.cols && !spot; c++) {
      const t = w.tiles[r]![c]!;
      if (!t.booth && !t.scenery) spot = { c, r };
    }
  }
  assert.ok(spot);
  assert.ok(w.placeScenery("PLANT_3", spot.c, spot.r));
  const money = w.money;

  const restored = deserialize(serialize(w));
  assert.ok(restored, "the save should load");
  assert.equal(restored.money, money);
  assert.equal(restored.researchPoints, 42);
  assert.equal(restored.day, 7);
  assert.equal(restored.hour, 14.5);
  assert.equal(restored.stats.guestsServed, 9);
  assert.equal(restored.booths.length, w.booths.length);
  assert.ok(
    restored.booths.some((b) => b.type === "Pool" && b.col === pool.c && b.row === pool.r),
  );
  assert.equal(restored.tiles[spot.r]?.[spot.c]?.scenery, "PLANT_3");
});

test("a save keeps the map layout", () => {
  const w = new World({ tier: 0 });
  const before = w.tiles.map((row) => row.map((t) => t.id).join(","));
  const restored = deserialize(serialize(w));
  assert.ok(restored);
  const after = restored.tiles.map((row) => row.map((t) => t.id).join(","));
  assert.deepEqual(after, before);
});

test("loading a save does not keep the starter resort twice", () => {
  const w = new World({ tier: 0 });
  const restored = deserialize(serialize(w));
  assert.ok(restored);
  assert.equal(restored.booths.length, w.booths.length);
});

test("a corrupt save is rejected rather than crashing", () => {
  assert.equal(deserialize("not json"), null);
  assert.equal(deserialize("{}"), null);
  assert.equal(deserialize(JSON.stringify({ version: 99 })), null);
});

test("saved facilities keep their level", () => {
  const w = new World({ tier: 0 });
  const at = freeSpot(w, "Cottage");
  const b = w.placeBooth("Cottage", at.c, at.r);
  assert.ok(b);
  b.level = 2;
  b.served = 17;
  const restored = deserialize(serialize(w));
  const saved = restored?.booths.find((x) => x.col === at.c && x.row === at.r);
  assert.equal(saved?.level, 2);
  assert.equal(saved?.served, 17);
});
