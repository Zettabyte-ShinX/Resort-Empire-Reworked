import assert from "node:assert/strict";
import { test } from "node:test";

import { World } from "../src/core/world.ts";
import { deserialize, serialize } from "../src/core/save.ts";

test("a saved resort round-trips", () => {
  const w = new World({ tier: 0, startingMoney: 20000 });
  w.money = 12345;
  w.researchPoints = 42;
  w.day = 7;
  w.hour = 14.5;
  w.stats.guestsServed = 9;
  w.placeBooth("Pool", 10, 10);
  w.placeScenery("PLANT_3", 20, 20);
  const money = w.money;

  const restored = deserialize(serialize(w));
  assert.ok(restored, "the save should load");
  assert.equal(restored.money, money);
  assert.equal(restored.researchPoints, 42);
  assert.equal(restored.day, 7);
  assert.equal(restored.hour, 14.5);
  assert.equal(restored.stats.guestsServed, 9);
  assert.equal(restored.booths.length, w.booths.length);
  assert.ok(restored.booths.some((b) => b.type === "Pool" && b.col === 10 && b.row === 10));
  assert.equal(restored.tiles[20]?.[20]?.scenery, "PLANT_3");
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
  const b = w.placeBooth("Cottage", 8, 8);
  assert.ok(b);
  b.level = 2;
  b.served = 17;
  const restored = deserialize(serialize(w));
  const saved = restored?.booths.find((x) => x.col === 8 && x.row === 8);
  assert.equal(saved?.level, 2);
  assert.equal(saved?.served, 17);
});
