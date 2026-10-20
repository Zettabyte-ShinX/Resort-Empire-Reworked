/**
 * Typed access to the game's content and balance tables.
 *
 * `data.json` is produced by `tools/extract_as3_data.py` from the decompiled
 * ActionScript sources of the original game. It holds the *facts* of the game
 * (what facilities exist, what they cost, how popular they are, when the
 * resort opens and closes) rather than any of the original's code.
 */

import raw from "./data.generated.ts";

export interface TileDef {
  nama: string;
  mainJenis: number;
  lbl: string;
  jenis: number;
  fr: number;
  walkable: boolean;
  plenty: boolean;
  price: number;
  pop: number;
}

export interface SceneryDef {
  nama: string;
  lbl: string;
  jenis: number;
  fr: number;
  price: number;
  pop: number;
  unlocked_level?: number;
  unlocked_persen?: number;
}

export interface BoothDef {
  nama: string;
  nic: string;
  ROWS: number;
  COLS: number;
  fr: number;
  wall: number;
  wall_alpha: number;
  blok: number;
  standbooth: boolean;
  mainJenis: string;
  jenis: string;
  price: number[];
  booked_price: number | number[];
  opened: number;
  closed: number;
  xpt: number;
  drainpop: number;
  sumStaff: number;
  salary: number[];
  RP_upgrade: number[];
  pop: number[];
  Exp_add: number[][];
  Exp: number[];
  UT: number[];
  boostMood: { served?: unknown; canceled?: unknown };
  desc: string[];
  extraUpgrade?: string;
}

export interface SmileyDef {
  nama: string;
  range_a: number;
  range_b: number;
  nilai: number;
}

/**
 * One of the original's guest types.
 *
 * The `likes` table says which facilities the guest wants and how much each
 * one is worth to them; the rooms are the ones they can stay the night in.
 */
export interface GuestDef {
  jenis: number;
  sex: number;
  speed: number;
  MAX_MOOD: number;
  money: number;
  room_stay: number;
  tip: number;
  hygiene: number;
  hygCounter: number;
  medical_prob: number;
  maxK: number;
  old: boolean;
  likes: {
    Room: string[];
    Room2: number;
    Facility: [string[], number[]];
    Other: string[];
  };
}

/** A map size tier from the original's EXPAND table. */
export interface MapTier {
  cols: number;
  rows: number;
  /** Half-extent of the starting buildable plot, in tiles. */
  lahan: { x: number; y: number };
}

export interface GameData {
  tiles: Record<string, TileDef>;
  scenery: Record<string, SceneryDef>;
  booths: Record<string, BoothDef>;
  visitor: Record<string, unknown>;
  smiley: Record<string, SmileyDef>;
  listing: string[];
  sceneryListing: string[];
  jamBangun: [number, number][];
  jamTidur: [number, number][];
  istirahatTimer: [number, number][];
  maximumPembanding: Record<string, number[]>;
  expandPrice: number[];
  /** `zmap.MAP.sceneries` - plant species per tile. */
  mapSceneries: Record<string, number>;
  /** `zmap.MAP.tileDefault` - tile overrides for the starting map. */
  mapTileDefault: Record<string, { jenis: number; ipath: boolean }>;
  /** `zmap.MAP.kepiting` - hedge tiles. */
  mapKepiting: Record<string, boolean>;
}

const d = raw as unknown as {
  dataOb: {
    Tile: Record<string, TileDef>;
    Scenery: Record<string, SceneryDef>;
    Booth: Record<string, BoothDef>;
    Visitor: Record<string, unknown>;
    Smiley: Record<string, SmileyDef>;
    listing: string[];
    jamBangun: [number, number][];
    jamTidur: [number, number][];
    istirahatTimer: [number, number][];
    MaximumPembanding: Record<string, number[]>;
  };
  _statics: {
    EXPAND: { price: number[] };
    Achievements: Record<string, AchievementDef>;
    Mission: {
      listing: string[];
      [id: string]: unknown;
    };
    Extra_Upgrade: {
      listing: string[];
      [id: string]: unknown;
    };
    ResearchPoint: {
      level_: number[];
      bonusLevel: number[];
      bonusRP: number[];
      addPoint: Record<string, number[]>;
    };
    Unlocked: Record<string, readonly string[]>;
  };
  MAP: {
    sceneries: Record<string, number>;
    tileDefault: Record<string, { jenis: number; ipath: boolean }>;
    kepiting: Record<string, boolean>;
  };
};

export const DATA: GameData = {
  tiles: d.dataOb.Tile,
  scenery: d.dataOb.Scenery,
  booths: d.dataOb.Booth,
  visitor: d.dataOb.Visitor,
  smiley: d.dataOb.Smiley,
  listing: d.dataOb.listing,
  sceneryListing: d.dataOb.Scenery.listing as unknown as string[],
  jamBangun: d.dataOb.jamBangun,
  jamTidur: d.dataOb.jamTidur,
  istirahatTimer: d.dataOb.istirahatTimer,
  maximumPembanding: d.dataOb.MaximumPembanding,
  expandPrice: d._statics.EXPAND.price,
  mapSceneries: d.MAP.sceneries,
  mapTileDefault: d.MAP.tileDefault,
  mapKepiting: d.MAP.kepiting,
};

/** The three map sizes the original offers. */
export const MAP_TIERS: MapTier[] = [
  { cols: 37, rows: 37, lahan: { x: 16, y: 16 } },
  { cols: 43, rows: 43, lahan: { x: 22, y: 22 } },
  { cols: 50, rows: 50, lahan: { x: 29, y: 29 } },
];

/** Facility ids, in the order the original offered them. */
export const BOOTH_IDS = Object.keys(DATA.booths).filter(
  (k) => k !== "boostMood",
) as (keyof typeof DATA.booths)[];

export function tileDef(id: string): TileDef {
  const t = DATA.tiles[id];
  if (!t) throw new Error(`unknown tile ${id}`);
  return t;
}

export function sceneryDef(id: string): SceneryDef {
  const s = DATA.scenery[id];
  if (!s) throw new Error(`unknown scenery ${id}`);
  return s;
}

export function boothDef(id: string): BoothDef {
  const b = DATA.booths[id];
  if (!b) throw new Error(`unknown booth ${id}`);
  return b;
}

/**
 * The facilities that can grow into a bigger plot when they are upgraded.
 *
 * The original draws a facility's floor as a plate in the `BoothTile` clip:
 * three plates per facility, one for each upgrade level. The plate of a
 * facility that still has room to grow carries a red outline on the tile
 * the facility can take over, and that marking is what says the facility
 * can expand. The lobby and the small stalls have no such marking, so they
 * never grow.
 */
export const GROWABLE = new Set<string>([
  "Arcade",
  "Bar",
  "BaratResto",
  "Cottage",
  "Golf",
  "Gym",
  "IndiaResto",
  "Jacuzi",
  "JapanResto",
  "Lodge",
  "Medical",
  "Minimarket",
  "Pool",
  "Sauna",
  "Spa",
]);

/** Whether a facility of this type can grow into a bigger plot. */
export function canGrow(type: string): boolean {
  return GROWABLE.has(type);
}

/**
 * How many guests a room sleeps.
 *
 * The original books one room per guest, and the rooms are not all the
 * same size: a lodge has two beds, so a couple travelling together fits
 * into one, while a cottage has a bed for a single guest.
 */
const ROOM_BEDS: Record<string, number> = {
  Cottage: 1,
  Lodge: 2,
};

/** How many guests a room of this kind holds. */
export function roomBeds(type: string): number {
  return ROOM_BEDS[type] ?? 1;
}

/** The original's guest type, numbered 1 to 29. */
export function guestDef(variant: number): GuestDef {
  const g = DATA.visitor[`Visitor${variant}`] as GuestDef | undefined;
  if (!g) throw new Error(`unknown guest ${variant}`);
  return g;
}

/** One of the original's purchasable extras. */
export interface ExtraDef {
  name: string;
  effect: string;
  /** The facility that has to be built for it to show up. */
  unlocked: string;
  price: number;
  /** The research level it needs. */
  need_star: number;
  /** A percentage, for the extras that change a price. */
  val?: number;
}

export const EXTRAS: Record<string, ExtraDef> = raw._statics.Extra_Upgrade as unknown as Record<
  string,
  ExtraDef
>;

/** One of the original's achievements. */
export interface AchievementDef {
  nama: string;
  desc: string;
  /** The money the player is given. */
  bonus: number;
  /** The research points the player is given. */
  RP: number;
}

export const ACHIEVEMENTS: Record<string, AchievementDef> = raw._statics
  .Achievements as unknown as Record<string, AchievementDef>;

/** One of the original's missions. */
export interface MissionDef {
  desc: string;
  /** The money the player is given. */
  bonus: number;
  /** How many are needed to finish it. */
  batas: number;
}

export const MISSIONS: Record<string, MissionDef> = raw._statics.Mission as unknown as Record<
  string,
  MissionDef
>;

/** The missions the original lists, in order. */
export const MISSION_LIST: string[] = (raw._statics.Mission as unknown as {
  listing: string[];
}).listing;

/** The order the original lists its extras in. */
export const EXTRA_LIST: string[] = (raw._statics.Extra_Upgrade as unknown as {
  listing: string[];
}).listing;

/** The original's research tree. */
export interface ResearchDef {
  /** The research points needed for each level. */
  level_: number[];
  bonusLevel: number[];
  bonusRP: number[];
  addPoint: Record<string, number[]>;
  /** What each research level unlocks. */
  Unlocked: Record<string, readonly string[]>;
}

export const RESEARCH: ResearchDef = {
  ...(raw._statics.ResearchPoint as unknown as Omit<ResearchDef, "Unlocked">),
  Unlocked: raw._statics.Unlocked,
};

/** The research level a number of research points reaches. */
export function researchLevel(points: number): number {
  const levels = RESEARCH.level_;
  let level = 0;
  for (const threshold of levels) {
    if (points >= threshold) level++;
  }
  return level;
}

/** The research level a facility is unlocked at, or null if it is free. */
export function unlockLevel(facility: string): number | null {
  for (const [key, list] of Object.entries(RESEARCH.Unlocked)) {
    if (!list.includes(facility)) continue;
    const m = /^level_(\d+)$/.exec(key);
    if (m) return Number(m[1]);
  }
  return null;
}

/** Price of a booth at a given upgrade level (0..2). */
export function boothPrice(id: string, level: number): number {
  const p = boothDef(id).price;
  return p[Math.min(level, p.length - 1)] ?? 0;
}

/** Popularity multiplier of a booth at a given upgrade level. */
export function boothPopularity(id: string, level: number): number {
  const p = boothDef(id).pop;
  return p[Math.min(level, p.length - 1)] ?? 0;
}
