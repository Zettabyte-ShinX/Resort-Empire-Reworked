/**
 * The resort simulation.
 *
 * This is a clean-room reimplementation: it reproduces the *rules* of the
 * original game (facility costs, popularity, opening hours, the 24 hour clock,
 * guest satisfaction and the research/upgrade economy) but none of its code.
 *
 * The model is deliberately headless - it knows nothing about rendering - so
 * it can be unit tested and later reused for a server-authoritative build.
 */

import {
  ACHIEVEMENTS,
  BOOTH_IDS,
  DATA,
  EXTRAS,
  MAP_TIERS,
  RESEARCH,
  boothDef,
  boothPopularity,
  boothPrice,
  guestDef,
  researchLevel,
  sceneryDef,
  tileDef,
  unlockLevel,
} from "./data.ts";
import type { BoothDef } from "./data.ts";
import { findPath } from "./pathfind.ts";
import type { GridPos } from "./iso.ts";

export type TileKind = "path" | "grass";

export interface Tile {
  /**
   * The original's tile id, e.g. `TILE_7`. It carries the art frame the game
   * uses, so the renderer can pick the matching ground graphic.
   */
  id: string;
  walkable: boolean;
  /** Scenery id (`PLANT_x`) placed on this tile, if any. */
  scenery: string | null;
  /** Booth id occupying this tile, if any. */
  booth: string | null;
}

export interface BoothInstance {
  id: number;
  type: string;
  col: number;
  row: number;
  cols: number;
  rows: number;
  level: number;
  /** Research points spent on this booth. */
  rp: number;
  /** Guests currently inside. */
  occupancy: number;
  /** Total guests served since the resort opened. */
  served: number;
  /** Average satisfaction of the guests it served, 0..100. */
  satisfaction: number;
  /** Whether the facility is still being built. */
  building: boolean;
  /** Experience gained from the guests it has served. */
  exp: number;
  /** Whether it has enough experience to be upgraded. */
  canUpgrade: boolean;
  /** How far the building has got, 0..1. */
  buildProgress: number;
}

export type VisitorState =
  | "arriving"
  | "seeking"
  | "walking"
  | "using"
  | "leaving"
  | "done";

export interface Visitor {
  id: number;
  /** Fractional grid position. */
  col: number;
  row: number;
  /** Target tile the guest is currently walking towards. */
  path: GridPos[];
  target: BoothInstance | null;
  state: VisitorState;
  /** Satisfaction, 0..100. */
  mood: number;
  /** How much the guest is willing to spend. */
  budget: number;
  spent: number;
  archetype: string;
  /** The original's guest type, 1 to 29. */
  variant: number;
  /** How many facilities the guest has visited. */
  visits: number;
  /** Whether the guest has checked in at the lobby. */
  checkedIn: boolean;
  /** Whether the guest has been to the room it was given. */
  usedRoom: boolean;
  /** Seconds remaining in the current activity. */
  timer: number;
  /** Visual variety seed. */
  seed: number;
  /** Screen-space direction of travel, -1, 0 or 1 on each axis. */
  dirX: number;
  dirY: number;
  /** Whether the guest is on the move. */
  moving: boolean;
  /** Counts down to the guest leaving litter behind. */
  hygieneCounter: number;
}

export interface WorldOptions {
  tier?: number;
  startingMoney?: number;
}

const HOUR_SECONDS = 2.2;

/**
 * How long a facility takes to build, in seconds of game time.
 *
 * The original plays a construction animation of a few seconds before the
 * facility opens.
 */
const BUILD_SECONDS = 6;

/**
 * Where the original anchors the buildable plot.
 *
 * The plot is not centred on the grid: `MapContainer` uses a fixed corner
 * (row 10, column 11) and measures the plot outwards from there, so it
 * grows towards the bottom right of the map as the resort expands.
 */
const PLOT_CORNER_ROW = 10;
const PLOT_CORNER_COL = 11;

/** Aggregate numbers the management panels show. */
export interface WorldStats {
  guestsArrived: number;
  guestsServed: number;
  guestsLeftUnhappy: number;
  revenue: number;
  wages: number;
  built: number;
  demolished: number;
  /** How many facilities have been upgraded. */
  upgraded: number;
  /** How many of the original's special guests have visited. */
  specialVisited: number;
}

export const SPEEDS = [0, 1, 2, 4] as const;

/** The eight neighbouring grid offsets. */
const NB = new Int8Array([
  1, 0, -1, 0, 0, 1, 0, -1,
  1, 1, 1, -1, -1, 1, -1, -1,
]);

/** Build a tile from one of the original's tile ids. */
function makeTile(id: string): Tile {
  const def = tileDef(id);
  return { id, walkable: def.walkable, scenery: null, booth: null };
}

/** The smiley a guest's mood falls into, as the original's bands. */
function moodBand(mood: number): number {
  if (mood >= 80) return 0;
  if (mood >= 65) return 1;
  if (mood >= 55) return 2;
  return 3;
}

export class World {
  cols: number;
  rows: number;
  tier: number;

  tiles: Tile[][] = [];
  booths: BoothInstance[] = [];
  visitors: Visitor[] = [];

  money: number;
  researchPoints = 0;
  /** 0..24 float hour of the day. */
  hour = 8;
  day = 1;
  /** Ticks elapsed, used for deterministic-ish animation phase. */
  time = 0;
  /** 0 = paused, otherwise a multiplier on the simulation speed. */
  speed = 1;
  /** Set when something the player should see happened. */
  log: string[] = [];
  /** Sounds the original plays for what just happened. */
  sounds: string[] = [];
  stats: WorldStats = {
    guestsArrived: 0,
    guestsServed: 0,
    guestsLeftUnhappy: 0,
    revenue: 0,
    wages: 0,
    built: 0,
    demolished: 0,
    upgraded: 0,
    specialVisited: 0,
  };
  /** Achievements the player has reached, by id. */
  achievements: Record<string, number> = {};
  /** Revenue earned in each hour of the day, for the reports panel. */
  hourlyRevenue: number[] = new Array(24).fill(0);

  private nextBoothId = 1;
  private nextVisitorId = 1;

  /**
   * Cached routes between tiles.
   *
   * Guests travel the same handful of routes over and over - entrance to
   * booth, booth to booth - and a path search is by far the most expensive
   * thing the simulation does. On a slow CPU an uncached search is a visible
   * stutter, so routes are remembered and invalidated whenever the map
   * changes.
   */
  private pathCache = new Map<string, GridPos[]>();
  private static readonly PATH_CACHE_LIMIT = 400;
  /** How many path searches may run in a single frame. */
  private pathBudget = 3;
  private pathsQueued = 0;

  constructor(opts: WorldOptions = {}) {
    this.tier = opts.tier ?? 0;
    const t = MAP_TIERS[this.tier];
    this.cols = t.cols;
    this.rows = t.rows;
    this.money = opts.startingMoney ?? 20000;
    this.generate();
  }

  // ---------------------------------------------------------------- map ----

  private generate(seed = true): void {
    const t = MAP_TIERS[this.tier];
    this.tiles = [];

    // The original's starting map, reproduced from `pack/MapContainer.as`
    // (`BuildMap`) and `pack/serbi.as`. The plot is not centred on the grid:
    // the original anchors it at a fixed corner and lets it grow from there.
    //
    //   * an asphalt road along two edges and around the far side
    //   * a sidewalk band inside the road
    //   * a sand coloured buildable plot in the middle
    //   * a hedge of green blocks around the plot, with a gap for the gate
    const boundX = PLOT_CORNER_ROW + t.lahan.x;
    const boundY = PLOT_CORNER_COL + t.lahan.y;
    const bound2X = boundX + 3;
    const bound2Y = boundY + 3;
    const bound3X = bound2X + 2;
    const bound3Y = bound2Y + 2;

    for (let r = 0; r < this.rows; r++) {
      const row: Tile[] = [];
      for (let c = 0; c < this.cols; c++) {
        let id: string;
        if (r === 4 || r === 5) {
          id = "TILE_83"; // asphalt road
        } else if (c === 5 || c === 6) {
          id = "TILE_83"; // asphalt road
        } else if (c > bound2Y && c <= bound3Y) {
          id = "TILE_83"; // asphalt road
        } else if (r > bound2X && r <= bound3X) {
          id = "TILE_83"; // asphalt road
        } else if (c > 6 && c <= bound2Y && r > 5 && r <= bound2X) {
          if (r > PLOT_CORNER_ROW && r < boundX && c > PLOT_CORNER_COL && c < boundY) {
            id = "TILE_80"; // sand plot
          } else {
            id = "TILE_82"; // sidewalk band
          }
        } else {
          id = "TILE_0"; // bare ground
        }
        row.push(makeTile(id));
      }
      this.tiles.push(row);
    }

    // The entrance corridor, from `zmap.MAP.tileDefault`.
    for (const [name, def] of Object.entries(DATA.mapTileDefault)) {
      if (!name.startsWith("tile_")) continue;
      const m = /^tile_(-?\d+)_(-?\d+)$/.exec(name);
      if (!m) continue;
      const r = Number(m[1]);
      const c = Number(m[2]);
      if (r < 0 || c < 0 || r >= this.rows || c >= this.cols) continue;
      const tile = this.tiles[r]![c]!;
      tile.id = `TILE_${def.jenis}`;
      tile.walkable = tileDef(tile.id).walkable;
    }

    // Hedges and scenery from `zmap.MAP`.
    for (const [name, species] of Object.entries(DATA.mapSceneries)) {
      const m = /^tile_(-?\d+)_(-?\d+)$/.exec(name);
      if (!m) continue;
      const r = Number(m[1]);
      const c = Number(m[2]);
      if (r < 0 || c < 0 || r >= this.rows || c >= this.cols) continue;
      this.tiles[r]![c]!.scenery = `PLANT_${species}`;
    }
    for (const name of Object.keys(DATA.mapKepiting)) {
      const m = /^tile_(-?\d+)_(-?\d+)$/.exec(name);
      if (!m) continue;
      const r = Number(m[1]);
      const c = Number(m[2]);
      if (r < 0 || c < 0 || r >= this.rows || c >= this.cols) continue;
      this.tiles[r]![c]!.scenery = "HEDGE";
    }

    // The original rings the buildable plot with a row of green hedge blocks,
    // leaving a gap for the gate (`MapContainer.CreatingSceneryDefault`).
    const hedge: [number, number][] = [];
    for (let r = 10; r <= boundX; r++) hedge.push([r, 11]);
    for (let c = 12; c <= boundY; c++) {
      if (c < 20 || c > 23) hedge.push([10, c]);
    }
    for (let r = 11; r < boundX; r++) hedge.push([r, boundY]);
    for (let c = 12; c <= boundY; c++) hedge.push([boundX, c]);
    for (const [r, c] of hedge) {
      if (r < 0 || c < 0 || r >= this.rows || c >= this.cols) continue;
      this.tiles[r]![c]!.scenery = "HEDGE";
    }

    // The gate: the original leaves a gap in the hedge for the entrance and
    // makes those tiles walkable (`zmap.MAP.tileDefault`). The plot itself
    // is not walkable: the guest walks on the paths the player lays.
    this.entrance = { col: PLOT_CORNER_COL + 10, row: PLOT_CORNER_ROW };
    for (let c = PLOT_CORNER_COL + 9; c <= PLOT_CORNER_COL + 12; c++) {
      if (c < 0 || c >= this.cols) continue;
      const gate = this.tiles[PLOT_CORNER_ROW]![c]!;
      gate.id = "TILE_1";
      gate.walkable = true;
    }

    this.recomputePopularity();
    this.recomputeReachable();
    if (seed) this.seedStarterResort();
  }

  /**
   * Grow the resort.
   *
   * The original's resort expands in three steps, each one larger than the
   * last, with the plot growing away from the gate so that what the player
   * has built stays where it is.
   */
  expand(): boolean {
    if (this.tier >= MAP_TIERS.length - 1) return false;
    const price = DATA.expandPrice[this.tier + 1] ?? 0;
    if (this.money < price) return false;

    // Keep everything the player has built.
    const oldTiles = this.tiles;
    const booths = this.booths;
    const money = this.money;
    const research = this.researchPoints;
    const extras = new Set(this.extras);
    const stats = { ...this.stats };
    const achievements = { ...this.achievements };

    this.tier += 1;
    const t = MAP_TIERS[this.tier];
    this.cols = t.cols;
    this.rows = t.rows;
    this.generate(false);

    // Put the facilities, the plants and the paths back where they were.
    for (let r = 0; r < oldTiles.length; r++) {
      for (let c = 0; c < oldTiles[r]!.length; c++) {
        const old = oldTiles[r]![c]!;
        const tile = this.tiles[r]?.[c];
        if (!tile) continue;
        if (old.booth) {
          tile.booth = old.booth;
          tile.walkable = true;
        } else if (old.scenery && old.scenery !== "HEDGE") {
          // The hedge belongs to the map, not to the player, so it is not
          // carried over: the new map draws its own.
          tile.scenery = old.scenery;
        } else if (old.id === "TILE_1" && old.walkable) {
          // A path the player laid.
          tile.id = "TILE_1";
          tile.walkable = true;
        }
      }
    }
    this.booths = booths;
    this.money = money - price;
    this.researchPoints = research;
    this.extras = extras;
    this.stats = stats;
    this.achievements = achievements;

    this.invalidatePaths();
    this.recomputePopularity();
    this.recomputeReachable();
    this.log.push(`The resort has been expanded.`);
    return true;
  }

  /**
   * Lay down the resort the player starts with: a lobby to check in at and a
   * couple of facilities so there is something to do from the first minute.
   *
   * They are placed on the buildable plot, in the order the original puts
   * them up: the lobby at the entrance end, then rooms and facilities
   * spreading back into the resort.
   */
  private seedStarterResort(): void {
    const plot = this.plotBounds();
    const starters: [string, number, number][] = [
      // The lobby is 4 rows deep, so it sits in the southern half of the
      // plot; the pool takes the northern corner and the rest fills in.
      ["Lobby", plot.c0 + 2, plot.r1 - 6],
      ["Cottage", plot.c0 + 2, plot.r0 + 2],
      ["Pool", plot.c1 - 6, plot.r0 + 2],
      ["Icecream", plot.c1 - 2, plot.r0 + 2],
    ];
    const placed: BoothInstance[] = [];
    for (const [type, col, row] of starters) {
      if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) continue;
      const saved = this.money;
      this.money = Number.MAX_SAFE_INTEGER;
      const booth = this.placeBooth(type, col, row, true);
      this.money = saved;
      if (booth) {
        // The resort the player starts with is already built.
        booth.building = false;
        booth.buildProgress = 1;
        placed.push(booth);
        continue;
      }
      // The spot was taken: try a couple of nearby alternatives.
      for (const [dc, dr] of [
        [0, -3], [3, 0], [-3, 0], [0, 3], [4, -4], [-4, -4], [0, -6], [6, 0],
      ]) {
        const nc = col + dc;
        const nr = row + dr;
        if (nc < 0 || nr < 0 || nc >= this.cols || nr >= this.rows) continue;
        this.money = Number.MAX_SAFE_INTEGER;
        const ok = this.placeBooth(type, nc, nr, true);
        this.money = saved;
        if (ok) {
          ok.building = false;
          ok.buildProgress = 1;
          placed.push(ok);
          break;
        }
      }
    }
    this.layStarterPaths(placed);
    // The paths change what the guests can reach.
    this.recomputeWalkMask();
    this.recomputeReachable();
  }

  /**
   * Lay the paths that join the starting resort to the gate.
   *
   * The plot is not walkable ground: the guests can only reach what the
   * player has connected with paths, so the resort the player starts with
   * comes with the paths already laid.
   */
  private layStarterPaths(booths: BoothInstance[]): void {
    const gate = this.entrance;
    // The trunk: a path from the gate into the middle of the plot.
    const trunkCol = gate.col;
    const trunkRow = gate.row + 2;
    for (let r = gate.row + 1; r <= trunkRow; r++) this.layPath(trunkCol, r);

    for (const booth of booths) {
      // Try each way into the facility until one of them can be joined to
      // the trunk with a path.
      let done = false;
      for (const door of this.doorCandidates(booth)) {
        this.layPath(door.col, door.row);
        if (this.layPathTo(door, trunkCol, trunkRow, true)) {
          done = true;
          break;
        }
        if (this.layPathTo(door, trunkCol, trunkRow, false)) {
          done = true;
          break;
        }
      }
      if (!done) continue;
    }
  }

  /**
   * Lay a path from a tile to the trunk.
   *
   * `alongRow` picks whether the path runs along the row first or the
   * column first. Returns false when the way is blocked.
   */
  private layPathTo(from: GridPos, col: number, row: number, alongRow: boolean): boolean {
    const tiles: GridPos[] = [];
    if (alongRow) {
      const step = from.col < col ? 1 : -1;
      for (let c = from.col; c !== col; c += step) tiles.push({ col: c, row: from.row });
      const rstep = from.row < row ? 1 : -1;
      for (let r = from.row; r !== row; r += rstep) tiles.push({ col, row: r });
    } else {
      const rstep = from.row < row ? 1 : -1;
      for (let r = from.row; r !== row; r += rstep) tiles.push({ col: from.col, row: r });
      const step = from.col < col ? 1 : -1;
      for (let c = from.col; c !== col; c += step) tiles.push({ col: c, row });
    }
    for (const t of tiles) {
      const tile = this.tileAt(t.col, t.row);
      if (!tile || tile.booth || tile.scenery) return false;
    }
    for (const t of tiles) this.layPath(t.col, t.row);
    return true;
  }

  /** Lay a single path tile, if the ground is free. */
  private layPath(col: number, row: number): void {
    const tile = this.tileAt(col, row);
    if (!tile || tile.booth || tile.scenery) return;
    if (tile.walkable && tile.id !== "TILE_80") return;
    tile.id = "TILE_1";
    tile.walkable = true;
  }

  /** The tiles a guest could stand on to reach a facility. */
  private doorCandidates(booth: BoothInstance): GridPos[] {
    const candidates: GridPos[] = [];
    for (let c = booth.col; c < booth.col + booth.cols; c++) {
      candidates.push({ col: c, row: booth.row - 1 });
      candidates.push({ col: c, row: booth.row + booth.rows });
    }
    for (let r = booth.row; r < booth.row + booth.rows; r++) {
      candidates.push({ col: booth.col - 1, row: r });
      candidates.push({ col: booth.col + booth.cols, row: r });
    }
    return candidates.filter((c) => {
      const t = this.tileAt(c.col, c.row);
      return !!t && !t.booth && !t.scenery;
    });
  }


  /** The extent of the buildable plot, in grid coordinates. */
  plotBounds(): { c0: number; c1: number; r0: number; r1: number } {
    const t = MAP_TIERS[this.tier];
    return {
      c0: PLOT_CORNER_COL + 1,
      c1: PLOT_CORNER_COL + t.lahan.y - 1,
      r0: PLOT_CORNER_ROW + 1,
      r1: PLOT_CORNER_ROW + t.lahan.x - 1,
    };
  }

  tileAt(col: number, row: number): Tile | null {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return null;
    return this.tiles[row][col];
  }

  /**
   * Whether a guest can walk over this tile.
   *
   * The original's map has walkable and unwalkable ground: the plot of sand
   * and the grass are not walkable, the paths and the rooms are.
   */
  isWalkable(col: number, row: number): boolean {
    const t = this.tileAt(col, row);
    return !!t && t.walkable;
  }

  // ------------------------------------------------------------- build ----

  /**
   * Walkability bitmap, one byte per tile in row-major order.
   *
   * The pathfinder reads this directly instead of calling a predicate, which
   * keeps its inner loop free of megamorphic call sites.
   */
  private walkMask = new Uint8Array(0);

  private recomputeWalkMask(): void {
    const size = this.cols * this.rows;
    if (this.walkMask.length !== size) this.walkMask = new Uint8Array(size);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const t = this.tiles[r][c];
        this.walkMask[r * this.cols + c] = t.walkable ? 1 : 0;
      }
    }
  }

  /**
   * Tiles that guests can actually reach from the entrance.
   *
   * Flood filled whenever the map changes. Without this a guest can pick a
   * facility that is walled off, and the path search then has to explore the
   * entire reachable region before giving up - which on a slow CPU is a
   * multi-frame stall.
   */
  private reachable = new Uint8Array(0);
  private entrance = { col: 0, row: 0 };

  private recomputeReachable(): void {
    const size = this.cols * this.rows;
    if (this.reachable.length !== size) this.reachable = new Uint8Array(size);
    this.reachable.fill(0);
    this.recomputeWalkMask();

    const stack: number[] = [this.entrance.row * this.cols + this.entrance.col];
    this.reachable[this.entrance.row * this.cols + this.entrance.col] = 1;
    while (stack.length > 0) {
      const cur = stack.pop()!;
      const c = cur % this.cols;
      const r = (cur - c) / this.cols;
      for (let d = 0; d < 16; d += 2) {
        const nc = c + NB[d]!;
        const nr = r + NB[d + 1]!;
        if (nc < 0 || nr < 0 || nc >= this.cols || nr >= this.rows) continue;
        const ni = nr * this.cols + nc;
        if (this.reachable[ni]) continue;
        if (!this.isWalkable(nc, nr)) continue;
        this.reachable[ni] = 1;
        stack.push(ni);
      }
    }
  }

  private isReachable(col: number, row: number): boolean {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return false;
    return this.reachable[row * this.cols + col] === 1;
  }

  /** Upgrade a booth to the next level if it can be afforded. */
  upgradeBooth(booth: BoothInstance): boolean {
    if (booth.level >= 2) return false;
    // The original only lets a facility be upgraded once it has enough
    // experience from the guests it has served.
    const def = boothDef(booth.type);
    const expMax = def.Exp?.[booth.level + 1] ?? 0;
    if (expMax > 0 && booth.exp < expMax) return false;
    const cost = boothPrice(booth.type, booth.level + 1);
    if (this.money < cost) return false;
    this.money -= cost;
    booth.level++;
    booth.exp = 0;
    booth.canUpgrade = false;
    this.stats.upgraded++;
    this.recomputePopularity();
    this.log.push(`Upgraded ${booth.type} to level ${booth.level + 1}`);
    return true;
  }

  /** Can a booth of this type be placed with its corner at (col,row)? */
  /**
   * Check the original's achievements and pay out the ones that are earned.
   *
   * The original gives money and research points for each of them.
   */
  checkAchievements(): void {
    for (const [id, def] of Object.entries(ACHIEVEMENTS)) {
      if (this.achievements[id]) continue;
      if (!this.achievementEarned(id)) continue;
      this.achievements[id] = 1;
      this.money += def.bonus;
      this.researchPoints += def.RP;
      this.log.push(`${def.nama} - ${def.bonus} and ${def.RP} research points.`);
    }
  }

  /** Whether the player has earned an achievement. */
  private achievementEarned(id: string): boolean {
    const happy = this.visitors.length
      ? this.visitors.filter((v) => v.mood >= 65).length / this.visitors.length
      : 0;
    switch (id) {
      case "acv_credit":
        return true;
      case "acv_rookieResort":
        return this.visitors.length >= 10;
      case "acv_goodResort":
        return this.popularity >= 17 && happy >= 0.5;
      case "acv_loveBeingHere":
        return this.popularity >= 50 && happy >= 0.75;
      case "acv_goodResearch":
        return this.stats.upgraded >= 10;
      case "acv_growingResort":
        return this.booths.length >= 10;
      case "acv_grandResort":
        return this.booths.length >= 25;
      case "acv_marvelousResort":
        return this.booths.length >= BOOTH_IDS.length;
      case "acv_awesomeContractor":
        return this.tier >= 1;
      case "acv_expertContractor":
        return this.tier >= 2;
      case "acv_masterDev":
        return this.popularity >= 100 && this.tier >= 2;
      case "acv_superDev":
        return this.popularity >= 70 && this.booths.length >= BOOTH_IDS.length;
      case "acv_greenBucks":
        return this.money >= 250000;
      case "acv_bagOfGold":
        return this.money >= 500000;
      case "acv_famousResort":
        return this.stats.specialVisited >= 1;
      default:
        return false;
    }
  }

  /** The research level the resort has reached. */
  get researchLevel(): number {
    return researchLevel(this.researchPoints);
  }

  /** The extras the player has bought. */
  extras = new Set<string>();

  /** Litter left by the guests, by tile. */
  litter = new Map<string, number>();

  /** The janitor, if the resort has a janitor room. */
  janitor: { col: number; row: number; timer: number; working: number } | null = null;

  /**
   * Leave litter on a tile, the way the original's guests do.
   *
   * The chance depends on how dirty the guest is and how cross they are.
   */
  private dropLitter(v: Visitor): void {
    const def = guestDef(v.variant);
    const range = DATA.visitor.HYGIENE_RANGE as
      | { chance: number[]; sampah: number[][] }
      | undefined;
    if (!range) return;
    const chance = (range.chance[def.hygiene - 1] ?? 1) + (v.mood < 55 ? (55 - v.mood) / 12.5 : 0);
    if (Math.random() * 51 > chance) return;
    const samples = range.sampah[def.hygiene - 1] ?? [1];
    const n = v.mood > 50 ? 1 : samples[Math.floor(Math.random() * samples.length)] ?? 1;
    const key = `${Math.round(v.col)},${Math.round(v.row)}`;
    this.litter.set(key, (this.litter.get(key) ?? 0) + n);
    if (!this.janitor) this.log.push("Somebody should clean this up.");
  }

  /**
   * Move the janitor along the paths, picking up what it passes.
   */
  private updateJanitor(dt: number): void {
    const room = this.booths.find((b) => b.type === "JanitorRoom" && !b.building);
    if (!room) {
      this.janitor = null;
      return;
    }
    if (!this.janitor) {
      const door = this.boothDoor(room);
      this.janitor = {
        col: door?.col ?? room.col,
        row: door?.row ?? room.row,
        timer: 0,
        working: 0,
      };
    }
    const j = this.janitor;
    // Cleaning takes a moment.
    if (j.working > 0) {
      j.working -= dt;
      return;
    }
    j.timer -= dt;
    if (j.timer > 0) return;
    j.timer = 0.45;
    // Pick up the litter underfoot.
    const key = `${j.col},${j.row}`;
    const here = this.litter.get(key);
    if (here) {
      this.litter.delete(key);
      j.working = 0.8;
      return;
    }
    // Otherwise wander to a neighbouring tile the guests can walk on.
    const options: GridPos[] = [];
    for (const [dc, dr] of [[0, -1], [0, 1], [-1, 0], [1, 0]] as [number, number][]) {
      const c = j.col + dc;
      const r = j.row + dr;
      if (this.isWalkable(c, r) && this.isReachable(c, r)) options.push({ col: c, row: r });
    }
    if (options.length === 0) return;
    // Head for the litter if there is any.
    let best = options[0]!;
    let bestDist = Infinity;
    for (const o of options) {
      for (const [key2] of this.litter) {
        const [c, r] = key2.split(",").map(Number);
        const d = Math.abs(o.col - c!) + Math.abs(o.row - r!);
        if (d < bestDist) {
          bestDist = d;
          best = o;
        }
      }
    }
    j.col = best.col;
    j.row = best.row;
  }

  /**
   * Whether an extra can be bought: it needs the research level, the
   * facility it is tied to, and the money.
   */
  canBuyExtra(id: string): boolean {
    const def = EXTRAS[id];
    if (!def) return false;
    if (this.extras.has(id)) return false;
    if (this.researchLevel < def.need_star) return false;
    if (!this.booths.some((b) => b.type === def.unlocked)) return false;
    return this.money >= def.price;
  }

  /** Buy an extra. */
  buyExtra(id: string): boolean {
    if (!this.canBuyExtra(id)) return false;
    const def = EXTRAS[id]!;
    this.money -= def.price;
    this.extras.add(id);
    this.log.push(`Bought ${def.name}.`);
    this.recomputePopularity();
    return true;
  }

  /** Whether the player has bought an extra. */
  hasExtra(id: string): boolean {
    return this.extras.has(id);
  }

  /**
   * The price of a plant, after the extras that make it cheaper.
   */
  sceneryPrice(id: string): number {
    const def = sceneryDef(id);
    let price = def.price;
    // The original's extras each make one kind of tree cheaper.
    const cheaper: [string, string][] = [
      ["leaf", "PLANT_5"], // the cedar
      ["wallpaper", "PLANT_7"], // the palm
      ["sauce", "PLANT_4"], // the bamboo
    ];
    for (const [extra, plant] of cheaper) {
      if (!this.extras.has(extra)) continue;
      if (id !== plant) continue;
      const cut = EXTRAS[extra]?.val ?? 0;
      price = Math.max(1, Math.round(price * (1 - cut / 100)));
    }
    return price;
  }

  /** How much extra a facility earns, from the extras the player has bought. */
  private earningsBonus(type: string): number {
    let bonus = 0;
    if (this.extras.has("wine")) bonus += 0.2;
    if (this.extras.has("meat") && type === "Hotdog") bonus += 0.3;
    if (this.extras.has("bamboo") && type === "Cottage") bonus += 0.2;
    if (this.extras.has("palm") && type === "Lodge") bonus += 0.2;
    if (this.extras.has("irrigation") && type === "BaratResto") bonus += 0.3;
    return bonus;
  }

  /** The extra mood the bought extras give a guest at a facility. */
  private moodBonus(type: string, guestOld: boolean): number {
    let bonus = 0;
    if (this.extras.has("heater") && type === "Cottage") bonus += 4;
    if (this.extras.has("towel") && type === "Lodge") bonus += 4;
    if (this.extras.has("wifi")) bonus += 2;
    if (this.extras.has("aid") && guestOld) bonus += 4;
    return bonus;
  }

  /** Whether a facility has been unlocked by research yet. */
  isUnlocked(type: string): boolean {
    const need = unlockLevel(type);
    return need === null || this.researchLevel >= need;
  }

  canPlaceBooth(type: string, col: number, row: number): boolean {
    const def = boothDef(type);
    if (!this.isUnlocked(type)) return false;
    for (let r = row; r < row + def.ROWS; r++) {
      for (let c = col; c < col + def.COLS; c++) {
        const t = this.tileAt(c, r);
        if (!t) return false;
        if (t.booth) return false;
        if (t.scenery) return false;
      }
    }
    return true;
  }

  placeBooth(type: string, col: number, row: number, silent = false): BoothInstance | null {
    const def = boothDef(type);
    if (!this.canPlaceBooth(type, col, row)) return null;
    const cost = boothPrice(type, 0);
    if (this.money < cost) return null;

    this.money -= cost;
    const booth: BoothInstance = {
      id: this.nextBoothId++,
      type,
      col,
      row,
      cols: def.COLS,
      rows: def.ROWS,
      level: 0,
      rp: 0,
      occupancy: 0,
      served: 0,
      satisfaction: 0,
      building: true,
      buildProgress: 0,
      exp: 0,
      canUpgrade: false,
    };
    for (let r = row; r < row + def.ROWS; r++) {
      for (let c = col; c < col + def.COLS; c++) {
        const tile = this.tiles[r][c]!;
        tile.booth = type;
        // The original makes the tiles a facility stands on walkable, so the
        // guests can walk into the room.
        tile.walkable = true;
      }
    }
    this.booths.push(booth);
    this.stats.built++;
    this.invalidatePaths();
    this.recomputePopularity();
    this.recomputeReachable();
    if (!silent) this.log.push(`Built ${def.nama} for $${cost}`);
    return booth;
  }

  canPlaceScenery(id: string, col: number, row: number): boolean {
    const t = this.tileAt(col, row);
    if (!t) return false;
    if (t.booth) return false;
    if (t.scenery) return false;
    return this.money >= this.sceneryPrice(id);
  }

  placeScenery(id: string, col: number, row: number): boolean {
    if (!this.canPlaceScenery(id, col, row)) return false;
    this.money -= this.sceneryPrice(id);
    this.tiles[row][col].scenery = id;
    this.recomputePopularity();
    return true;
  }

  /** Can a path tile be laid here? */
  canPlaceTile(id: string, col: number, row: number): boolean {
    const t = this.tileAt(col, row);
    if (!t) return false;
    if (t.booth) return false;
    if (t.scenery) return false;
    const def = tileDef(id);
    if (def.price > this.money) return false;
    // Laying a path on grass is fine; paving over paving is not.
    return t.id !== id;
  }

  /** Lay a path tile. */
  placeTile(id: string, col: number, row: number): boolean {
    if (!this.canPlaceTile(id, col, row)) return false;
    const def = tileDef(id);
    this.money -= def.price;
    const tile = this.tiles[row]![col]!;
    tile.id = id;
    tile.walkable = def.walkable;
    this.invalidatePaths();
    this.recomputeReachable();
    return true;
  }

  /** Remove a plant from a tile. */
  removeScenery(col: number, row: number): boolean {
    const t = this.tileAt(col, row);
    if (!t || !t.scenery) return false;
    const def = DATA.scenery[t.scenery];
    if (def) this.money += Math.floor(def.price * 0.5);
    t.scenery = null;
    this.recomputePopularity();
    return true;
  }

  /** Remove every facility, used when loading a save. */
  clearBooths(): void {
    for (const b of [...this.booths]) {
      for (let r = b.row; r < b.row + b.rows; r++) {
        for (let c = b.col; c < b.col + b.cols; c++) {
          const t = this.tileAt(c, r);
          if (t) t.booth = null;
        }
      }
    }
    this.booths = [];
    this.invalidatePaths();
    this.recomputePopularity();
    this.recomputeReachable();
  }

  /** Recompute everything that depends on the map, after loading. */
  refresh(): void {
    this.recomputePopularity();
    this.recomputeReachable();
    this.invalidatePaths();
  }

  /** Remove a facility. */
  removeBooth(booth: BoothInstance): void {
    for (let r = booth.row; r < booth.row + booth.rows; r++) {
      for (let c = booth.col; c < booth.col + booth.cols; c++) {
        const t = this.tileAt(c, r);
        if (!t) continue;
        t.booth = null;
        // The ground goes back to being whatever it was before.
        t.walkable = tileDef(t.id).walkable;
      }
    }
    this.booths = this.booths.filter((b) => b.id !== booth.id);
    this.stats.demolished++;
    this.invalidatePaths();
    this.recomputePopularity();
    this.recomputeReachable();
    // Refund part of the cost, like the original's demolition.
    this.money += Math.floor(boothPrice(booth.type, booth.level) * 0.5);
  }

  // ---------------------------------------------------------- economy ----

  /**
   * Total popularity of the resort, which drives how many guests arrive.
   *
   * Cached, because computing it means walking every tile on the map and it
   * is read every single frame. It is only recomputed when the resort
   * actually changes.
   */
  get popularity(): number {
    return this.popularityCache;
  }

  private popularityCache = 0;

  private recomputePopularity(): void {
    let total = 0;
    for (const b of this.booths) {
      total += boothPopularity(b.type, b.level);
    }
    // Plants add a little charm, and the ornamental gardening extra makes
    // them count for more.
    const garden = this.extras.has("gardening") ? 1 + (EXTRAS.gardening?.val ?? 0) / 100 : 1;
    for (const row of this.tiles) {
      for (const t of row) {
        if (!t.scenery) continue;
        const def = DATA.scenery[t.scenery];
        if (def) total += def.pop * garden;
      }
    }
    this.popularityCache = total;
  }

  get guestCapacity(): number {
    return Math.max(4, Math.floor(this.popularity * 4));
  }

  // ---------------------------------------------------------- visitors ----

  private spawnVisitor(): void {
    // Each guest is one of the original's 29 types, which decides how it
    // looks, what it can afford and what it wants from the resort.
    const variant = 1 + Math.floor(Math.random() * 29) % 29;
    const def = guestDef(variant);
    const entryCol = this.entrance.col + (Math.random() < 0.5 ? -2 : 2);

    this.stats.guestsArrived++;
    this.visitors.push({
      id: this.nextVisitorId++,
      col: entryCol,
      row: this.entrance.row,
      path: [],
      target: null,
      state: "arriving",
      mood: 55 + Math.random() * 20,
      budget: def.money,
      spent: 0,
      archetype: `Visitor${variant}`,
      variant,
      visits: 0,
      checkedIn: false,
      usedRoom: false,
      timer: 0,
      seed: Math.random(),
      dirX: 0,
      dirY: 0,
      moving: false,
      hygieneCounter: def.hygCounter,
    });
  }

  /**
   * The facilities a guest wants to visit.
   *
   * The original gives every guest type a list of the facilities it likes
   * and what each of them is worth to it. Any other facility is still worth
   * a visit, just less, so a guest is never stuck with nothing to do.
   */
  private wantedFacilities(v: Visitor): { type: string; worth: number }[] {
    const def = guestDef(v.variant);
    const names = def.likes.Facility[0];
    const worth = def.likes.Facility[1];
    const out: { type: string; worth: number }[] = [];
    const seen = new Set<string>();
    names.forEach((name, i) => {
      if (seen.has(name)) return;
      seen.add(name);
      if (this.booths.some((b) => b.type === name)) {
        out.push({ type: name, worth: worth[i] ?? 20 });
      }
    });
    // A guest that has been at the resort long enough looks for a room.
    if (v.visits >= 1) {
      for (const name of def.likes.Room) {
        if (seen.has(name)) continue;
        seen.add(name);
        if (this.booths.some((b) => b.type === name)) {
          out.push({ type: name, worth: def.likes.Room2 });
        }
      }
    }
    // Anything else the resort has to offer.
    for (const b of this.booths) {
      if (seen.has(b.type)) continue;
      out.push({ type: b.type, worth: 15 });
    }
    return out;
  }

  /** The upgrade level of the newest facility of a type. */
  private levelOf(type: string): number {
    let level = 0;
    for (const b of this.booths) if (b.type === type) level = Math.max(level, b.level);
    return level;
  }

  /** Whether a facility is open at the current hour. */
  private isBoothOpen(booth: BoothInstance): boolean {
    const def = boothDef(booth.type);
    if (!def.opened && !def.closed) return true;
    const h = this.hour;
    if (def.opened < def.closed) return h >= def.opened && h < def.closed;
    // Some facilities, such as the bar, are open past midnight.
    return h >= def.opened || h < def.closed;
  }

  /** The tile a guest should stand on to reach a booth. */
  private boothDoor(booth: BoothInstance): GridPos | null {
    // Prefer the bottom edge, then the sides, then the top.
    const candidates: GridPos[] = [];
    const midC = booth.col + Math.floor(booth.cols / 2);
    for (let c = booth.col; c < booth.col + booth.cols; c++) {
      candidates.push({ col: c, row: booth.row + booth.rows });
    }
    for (let r = booth.row; r < booth.row + booth.rows; r++) {
      candidates.push({ col: booth.col - 1, row: r });
      candidates.push({ col: booth.col + booth.cols, row: r });
    }
    for (let c = booth.col; c < booth.col + booth.cols; c++) {
      candidates.push({ col: c, row: booth.row - 1 });
    }
    candidates.push({ col: midC, row: booth.row + booth.rows });

    for (const c of candidates) {
      if (this.isWalkable(c.col, c.row) && this.isReachable(c.col, c.row)) return c;
    }
    return null;
  }

  /**
   * The facility a guest should head for.
   *
   * The original checks in at the lobby when there is a room for the guest
   * to stay in, and only looks for something to do otherwise. A guest that
   * cannot get to either turns around and goes home.
   */
  private pickTarget(visitor: Visitor): boolean {
    // The guest checks in at the lobby when there is a room for it to stay
    // in and the resort is connected to the gate by a path.
    if (!visitor.checkedIn && this.canCheckIn(visitor)) {
      const lobby = this.booths.find((b) => b.type === "Lobby");
      if (lobby && this.walkTo(visitor, lobby)) return true;
    }
    // Then it goes to the room it was given.
    if (visitor.checkedIn && !visitor.usedRoom) {
      const room = this.roomFor(visitor);
      if (room && this.walkTo(visitor, room)) return true;
    }
    // Otherwise it looks for something it likes.
    const wanted = this.wantedFacilities(visitor);
    if (wanted.length === 0) return false;
    const open = wanted.filter((w) => {
      const booth = this.booths.find((b) => b.type === w.type);
      return booth && !booth.building && this.isBoothOpen(booth);
    });
    if (open.length === 0) return false;
    // Weight the choice by popularity and by how much the guest wants it, so
    // popular facilities get busier and the ones the guest likes get used.
    const weights = open.map(
      (w) =>
        Math.max(0.05, boothPopularity(w.type, this.levelOf(w.type))) * (w.worth / 40),
    );
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = Math.random() * total;
    let chosenType = open[0]!.type;
    for (let i = 0; i < open.length; i++) {
      roll -= weights[i]!;
      if (roll <= 0) {
        chosenType = open[i]!.type;
        break;
      }
    }
    const chosen = this.booths.find((b) => b.type === chosenType)!;

    return this.walkTo(visitor, chosen);
  }

  /**
   * The room a guest has been given.
   *
   * The original books the guest into a cottage or a lodge when it checks in.
   */
  private roomFor(visitor: Visitor): BoothInstance | null {
    const def = guestDef(visitor.variant);
    for (const type of def.likes.Room) {
      const room = this.booths.find((b) => b.type === type && !b.building);
      if (room) return room;
    }
    return null;
  }

  /**
   * Whether a guest can check in: there is a room for it to stay in, and the
   * lobby is connected to the entrance by a path.
   */
  private canCheckIn(visitor: Visitor): boolean {
    const def = guestDef(visitor.variant);
    const rooms = def.likes.Room;
    if (rooms.length === 0) return false;
    for (const type of rooms) {
      const room = this.booths.find((b) => b.type === type && !b.building);
      if (!room) continue;
      // The room has to be connected to the resort, or the guest cannot get
      // to it.
      if (!this.boothDoor(room)) continue;
      return true;
    }
    return false;
  }

  /**
   * Set a guest walking towards a facility.
   *
   * Returns false when there is no way there, which is what stops a guest
   * from setting off for a facility that is not connected to the resort.
   */
  private walkTo(visitor: Visitor, chosen: BoothInstance): boolean {
    const door = this.boothDoor(chosen);
    if (!door) return false;
    // Never chase a facility the guest physically cannot reach.
    if (!this.isReachable(door.col, door.row)) return false;

    const from = { col: Math.round(visitor.col), row: Math.round(visitor.row) };
    const key = `${from.col},${from.row}>${door.col},${door.row}`;
    let path: GridPos[] | undefined = this.pathCache.get(key);

    if (path === undefined) {
      // Searching is expensive; only a few are allowed per frame.
      if (this.pathBudget <= 0) {
        this.pathsQueued++;
        return false;
      }
      this.pathBudget--;
      const found = findPath(from, door, {
        mask: this.walkMask,
        bounds: { cols: this.cols, rows: this.rows },
      });
      if (found === null) {
        // Remember the failure so we do not search for it again every frame.
        this.cachePath(key, []);
        return false;
      }
      path = found;
      this.cachePath(key, path);
    }

    if (path.length === 0) return false;

    visitor.target = chosen;
    visitor.path = path.map((p) => ({ ...p }));
    visitor.state = "walking";
    return true;
  }

  private cachePath(key: string, path: GridPos[]): void {
    if (this.pathCache.size >= World.PATH_CACHE_LIMIT) {
      // Drop the oldest entry; Map preserves insertion order.
      const oldest = this.pathCache.keys().next();
      if (!oldest.done) this.pathCache.delete(oldest.value);
    }
    this.pathCache.set(key, path);
  }

  /** Forget every cached route; call whenever walkability changes. */
  private invalidatePaths(): void {
    this.pathCache.clear();
  }

  private updateVisitor(v: Visitor, dt: number): void {
    // The original's guests get dirty, and leave litter behind when they do.
    if (v.state !== "done" && v.state !== "leaving") {
      v.hygieneCounter -= dt * 4;
      if (v.hygieneCounter <= 0) {
        const def = guestDef(v.variant);
        v.hygieneCounter = def.hygCounter;
        this.dropLitter(v);
      }
    }
    switch (v.state) {
      case "arriving": {
        v.timer += dt;
        if (v.timer > 1.2) {
          v.timer = 0;
          v.state = "seeking";
        }
        break;
      }
      case "seeking": {
        if (this.pickTarget(v)) break;
        // Nothing it wants is open or reachable: it gets cross about it, and
        // eventually goes home.
        v.timer += dt;
        v.mood = Math.max(0, v.mood - dt * 3);
        if (v.timer > 12) {
          v.state = "leaving";
          v.timer = 0;
        }
        break;
      }
      case "walking": {
        this.advanceAlongPath(v, dt);
        if (v.path.length === 0) {
          v.state = "using";
          v.timer = 2 + Math.random() * 4;
          if (v.target) v.target.occupancy++;
        }
        break;
      }
      case "using": {
        v.timer -= dt;
        if (v.timer <= 0 && v.target) {
          this.completeVisit(v, v.target);
        }
        break;
      }
      case "leaving": {
        v.timer += dt;
        if (v.timer > 4) v.state = "done";
        break;
      }
      case "done":
        break;
    }
  }

  private advanceAlongPath(v: Visitor, dt: number): void {
    if (v.path.length === 0) {
      v.moving = false;
      return;
    }
    const speed = 2.2; // tiles per second
    let remaining = speed * dt;

    while (remaining > 0 && v.path.length > 0) {
      const next = v.path[0];
      const dc = next.col - v.col;
      const dr = next.row - v.row;
      const dist = Math.hypot(dc, dr);
      if (dist <= remaining) {
        v.col = next.col;
        v.row = next.row;
        v.path.shift();
        remaining -= dist;
      } else {
        const t = remaining / dist;
        v.col += dc * t;
        v.row += dr * t;
        remaining = 0;
      }
      // Record which way the guest is heading on screen, so the renderer can
      // pick the right pose and mirror it. The grid maps to the screen as
      // x = (row - col), y = -(row + col).
      v.dirX = Math.sign(dr - dc);
      v.dirY = -Math.sign(dr + dc);
    }
    v.moving = true;
  }

  private completeVisit(v: Visitor, booth: BoothInstance): void {
    const def = boothDef(booth.type);
    const price = Array.isArray(def.booked_price)
      ? def.booked_price[Math.min(booth.level, def.booked_price.length - 1)]
      : def.booked_price;

    const charge = Math.min(price || 0, Math.max(0, v.budget - v.spent)) *
      (1 + this.earningsBonus(booth.type));
    v.spent += charge;
    this.money += charge;
    this.stats.revenue += charge;
    const hourBucket = Math.floor(this.hour) % 24;
    this.hourlyRevenue[hourBucket] = (this.hourlyRevenue[hourBucket] ?? 0) + charge;

    // The original's guest types say what each facility is worth to them.
    const worth =
      this.wantedFacilities(v).find((w) => w.type === booth.type)?.worth ?? 40;
    const pop = boothPopularity(booth.type, booth.level);
    const old = guestDef(v.variant).old;
    const delta =
      (worth - 40) / 4 +
      pop * 3 +
      (charge > 0 ? 4 : -8) +
      this.moodBonus(booth.type, old);
    v.mood = Math.max(0, Math.min(100, v.mood + delta));
    v.visits++;
    // Checking in books the guest into a room, and going to that room is
    // what the original does next.
    if (booth.type === "Lobby") v.checkedIn = true;
    if (booth.type === "Cottage" || booth.type === "Lodge") v.usedRoom = true;

    booth.occupancy = Math.max(0, booth.occupancy - 1);
    booth.served++;
    this.stats.guestsServed++;
    this.sounds.push(charge > 0 ? "coin1" : "deskbell");
    booth.satisfaction =
      (booth.satisfaction * (booth.served - 1) + v.mood) / booth.served;

    // The facility gains experience from the guests it serves, and can be
    // upgraded once it has enough.
    const exp = def.Exp_add?.[Math.min(booth.level, 2)]?.[moodBand(v.mood)] ?? 1;
    booth.exp += exp;
    const expMax = def.Exp?.[booth.level + 1] ?? 0;
    if (expMax > 0 && booth.exp >= expMax) booth.canUpgrade = true;

    // Research points accrue from the guests a facility serves, as the
    // original's table says.
    const rp = RESEARCH.addPoint[booth.type]?.[Math.min(booth.level, 3)] ?? 0;
    if (rp > 0) this.researchPoints += rp;

    v.target = null;
    // A guest stays as long as it has things to do, then goes home.
    if (v.visits >= guestDef(v.variant).maxK) {
      v.state = "leaving";
      v.timer = 0;
    } else {
      v.state = "seeking";
      v.timer = 0;
    }
  }

  // ------------------------------------------------------------- clock ----

  /** Is the resort open right now? */
  get isOpen(): boolean {
    return this.hour >= 6 && this.hour < 23;
  }

  private clockTick(dt: number): void {
    const prevHour = Math.floor(this.hour);
    this.hour += (dt / HOUR_SECONDS);
    while (this.hour >= 24) {
      this.hour -= 24;
      this.day++;
    }
    if (Math.floor(this.hour) !== prevHour) this.onHour();
  }

  private onHour(): void {
    const h = Math.floor(this.hour);
    // Guests leave when the resort closes.
    if (h >= 23) {
      for (const v of this.visitors) {
        if (v.state !== "done") v.state = "leaving";
      }
    }
    // The staff are paid every day, as the original does.
    if (h === 0) this.payWages();
  }

  /** The daily wage bill of the staff working in the resort. */
  private payWages(): void {
    let wages = 0;
    for (const b of this.booths) {
      if (b.building) continue;
      const def = boothDef(b.type);
      if (!def.sumStaff) continue;
      const rate = def.salary[Math.min(b.level, def.salary.length - 1)] ?? 0;
      wages += rate * def.sumStaff;
    }
    if (wages <= 0) return;
    this.money -= wages;
    this.stats.wages += wages;
    this.log.push(`Paid $${wages} in wages.`);
  }

  // -------------------------------------------------------------- tick ----

  update(dt: number): void {
    if (this.speed === 0) return;
    const scaled = dt * this.speed;
    this.time += scaled;
    this.clockTick(scaled);
    // Reset the per-frame pathfinding budget.
    this.pathBudget = 3;
    this.pathsQueued = 0;

    // Facilities under construction.
    for (const b of this.booths) {
      if (!b.building) continue;
      b.buildProgress += scaled / BUILD_SECONDS;
      if (b.buildProgress >= 1) {
        b.buildProgress = 1;
        b.building = false;
        this.log.push(`${boothDef(b.type).nama} is open.`);
        this.sounds.push("cengkling");
        this.invalidatePaths();
        this.recomputePopularity();
        this.recomputeReachable();
      }
    }

    // Spawn new guests based on popularity, respecting capacity.
    if (this.isOpen && this.visitors.length < this.guestCapacity) {
      const rate = 0.22 + this.popularity * 0.05;
      if (Math.random() < rate * dt) this.spawnVisitor();
    }

    for (const v of this.visitors) {
      this.updateVisitor(v, dt);
    }
    this.updateJanitor(scaled);
    this.checkAchievements();
    // Drop finished guests.
    this.visitors = this.visitors.filter((v) => v.state !== "done");
  }

  // ------------------------------------------------------------ helpers --

  /** Snapshot for the HUD. */
  status() {
    return {
      money: this.money,
      hour: this.hour,
      day: this.day,
      guests: this.visitors.length,
      capacity: this.guestCapacity,
      popularity: this.popularity,
      research: this.researchPoints,
      researchLevel: this.researchLevel,
      booths: this.booths.length,
      open: this.isOpen,
    };
  }

  boothDefOf(b: BoothInstance): BoothDef {
    return boothDef(b.type);
  }
}

/** Format an hour as a 12 hour clock string. */
export function formatHour(hour: number): string {
  let h = Math.floor(hour) % 24;
  const ampm = h < 12 ? "am" : "pm";
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:00 ${ampm}`;
}

/** Look up a tile definition by kind and variant, for rendering. */
export function tileVisual(kind: TileKind, variant: number) {
  if (kind === "path") {
    const ids = ["TILE_1", "TILE_2", "TILE_3", "TILE_4"];
    return tileDef(ids[variant % ids.length]);
  }
  const ids = ["TILE_5", "TILE_6", "TILE_7", "TILE_8"];
  return tileDef(ids[variant % ids.length]);
}
