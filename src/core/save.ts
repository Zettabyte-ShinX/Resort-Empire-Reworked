/**
 * Saving and loading a resort.
 *
 * The original kept its saves in a Flash `SharedObject`, which is tied to the
 * domain the game was served from. This version keeps them in `localStorage`,
 * so they follow the player between the browser and the desktop app.
 */

import { tileDef } from "./data.ts";
import type { World } from "./world.ts";
import { World as WorldClass } from "./world.ts";

const KEY = "resort-empire-reworked/saves";

/** Whether a tile can be walked on, according to the original's data. */
function tileWalkable(id: string): boolean {
  try {
    return tileDef(id).walkable;
  } catch {
    return false;
  }
}
const VERSION = 1;

export interface SaveSlot {
  id: string;
  name: string;
  day: number;
  hour: number;
  money: number;
  guests: number;
  savedAt: number;
}

interface SaveData {
  version: number;
  tier: number;
  money: number;
  researchPoints: number;
  hour: number;
  day: number;
  speed: number;
  stats: World["stats"];
  achievements: Record<string, number>;
  tiles: { id: string; scenery: string | null }[][];
  booths: {
    type: string;
    col: number;
    row: number;
    level: number;
    served: number;
    satisfaction: number;
  }[];
}

export function serialize(world: World): string {
  const data: SaveData = {
    version: VERSION,
    tier: world.tier,
    money: world.money,
    researchPoints: world.researchPoints,
    hour: world.hour,
    day: world.day,
    speed: world.speed,
    stats: { ...world.stats },
    achievements: { ...world.achievements },
    tiles: world.tiles.map((row) =>
      row.map((t) => ({ id: t.id, scenery: t.scenery })),
    ),
    booths: world.booths.map((b) => ({
      type: b.type,
      col: b.col,
      row: b.row,
      level: b.level,
      served: b.served,
      satisfaction: b.satisfaction,
    })),
  };
  return JSON.stringify(data);
}

/** Rebuild a resort from saved data. Returns null if the data is unusable. */
export function deserialize(json: string): World | null {
  let data: SaveData;
  try {
    data = JSON.parse(json) as SaveData;
  } catch {
    return null;
  }
  if (!data || data.version !== VERSION || !Array.isArray(data.tiles)) return null;

  const world = new WorldClass({ tier: data.tier ?? 0, startingMoney: data.money ?? 0 });
  // The constructor lays out a fresh map and a starter resort; both are
  // replaced by the saved state.
  world.money = data.money;
  world.researchPoints = data.researchPoints ?? 0;
  world.hour = data.hour ?? 8;
  world.day = data.day ?? 1;
  world.speed = data.speed ?? 1;
  if (data.stats) world.stats = { ...data.stats };
  if (data.achievements) world.achievements = { ...data.achievements };

  world.tiles = data.tiles.map((row) =>
    row.map((t) => ({
      id: t.id,
      walkable: tileWalkable(t.id),
      scenery: t.scenery ?? null,
      booth: null,
    })),
  );

  world.clearBooths();
  // Placing a facility normally costs money, but a load must not be limited
  // by the cash the resort happened to have.
  world.money = Number.MAX_SAFE_INTEGER;
  for (const b of data.booths ?? []) {
    const booth = world.placeBooth(b.type, b.col, b.row, true);
    if (!booth) continue;
    booth.level = b.level ?? 0;
    booth.served = b.served ?? 0;
    booth.satisfaction = b.satisfaction ?? 0;
  }
  world.money = data.money;
  world.refresh();
  return world;
}

// -------------------------------------------------------------- storage ---

function readStore(): Record<string, { name: string; data: string; savedAt: number }> {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Record<string, never>) : {};
  } catch {
    return {};
  }
}

function writeStore(store: Record<string, { name: string; data: string; savedAt: number }>): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(store));
  } catch {
    // Storage may be unavailable (private browsing); the game still runs.
  }
}

export function listSaves(): SaveSlot[] {
  const store = readStore();
  return Object.entries(store)
    .map(([id, v]) => ({
      id,
      name: v.name,
      savedAt: v.savedAt,
      day: 0,
      hour: 0,
      money: 0,
      guests: 0,
    }))
    .sort((a, b) => b.savedAt - a.savedAt)
    .map((s) => {
      const w = deserialize(store[s.id]?.data ?? "");
      return w
        ? {
            ...s,
            day: w.day,
            hour: w.hour,
            money: w.money,
            guests: w.visitors.length,
          }
        : s;
    });
}

export function saveGame(world: World, name: string, id?: string): string {
  const store = readStore();
  const key = id ?? `save-${Date.now()}`;
  store[key] = { name, data: serialize(world), savedAt: Date.now() };
  writeStore(store);
  return key;
}

export function loadGame(id: string): World | null {
  const store = readStore();
  const entry = store[id];
  return entry ? deserialize(entry.data) : null;
}

export function deleteSave(id: string): void {
  const store = readStore();
  delete store[id];
  writeStore(store);
}
