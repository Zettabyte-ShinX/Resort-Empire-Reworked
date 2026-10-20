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
  DATA,
  MAP_TIERS,
  boothDef,
  boothPopularity,
  boothPrice,
  sceneryDef,
  tileDef,
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
  /** Seconds remaining in the current activity. */
  timer: number;
  /** Visual variety seed. */
  seed: number;
}

export interface WorldOptions {
  tier?: number;
  startingMoney?: number;
}

const HOUR_SECONDS = 2.2;

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

export class World {
  readonly cols: number;
  readonly rows: number;
  readonly tier: number;

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

  /** Set when something the player should see happened. */
  log: string[] = [];

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

  private generate(): void {
    const t = MAP_TIERS[this.tier];
    const cx = Math.floor(this.cols / 2);
    const cy = Math.floor(this.rows / 2);
    const half = t.lahan.x;

    // The original's starting map, reproduced from `pack/MapContainer.as`:
    //
    //   * an asphalt road ring around the outside
    //   * a sidewalk border just inside it
    //   * a sand coloured buildable plot in the middle
    //   * grass everywhere else
    //   * hedges and scenery placed at the coordinates in `zmap.MAP`
    const boundX = cx + half;
    const boundY = cy + half;
    const bound2X = boundX + 3;
    const bound2Y = boundY + 3;
    const bound3X = bound2X + 2;
    const bound3Y = bound2Y + 2;

    for (let r = 0; r < this.rows; r++) {
      const row: Tile[] = [];
      for (let c = 0; c < this.cols; c++) {
        let id = "TILE_5"; // grass
        if (r === 4 || r === 5 || c === 5 || c === 6) {
          id = "TILE_83"; // asphalt road
        } else if ((c > bound2Y && c <= bound3Y) || (r > bound2X && r <= bound3X)) {
          id = "TILE_83"; // asphalt road
        } else if (c > 6 && c <= bound2Y && r > 5 && r <= bound2X) {
          if (r > cx && r < boundX && c > cy && c < boundY) {
            id = "TILE_80"; // sand plot
          } else {
            id = "TILE_82"; // sidewalk border
          }
        } else if (r > 6 && r <= bound2X && c > 5 && c <= bound2X) {
          id = "TILE_82";
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
      this.tiles[r]![c]!.scenery = "PLANT_11";
    }

    // The original rings the buildable plot with a hedge. The coordinates in
    // `zmap.MAP.kepiting` are relative to the plot edge, so the ring is
    // rebuilt from the sidewalk border directly.
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const tile = this.tiles[r]![c]!;
        if (tile.id !== "TILE_82" || tile.scenery) continue;
        const onNorth = this.tiles[r]![c + 1]?.id === "TILE_80";
        const onWest = this.tiles[r + 1]?.[c]?.id === "TILE_80";
        if (onNorth || onWest) tile.scenery = "PLANT_11";
      }
    }

    // The entrance, where guests arrive.
    this.entrance = { col: cx, row: this.rows - 2 };
    for (let c = cx - 3; c <= cx + 3; c++) {
      if (c >= 0 && c < this.cols) {
        this.tiles[this.entrance.row]![c] = makeTile("TILE_82");
      }
    }

    this.recomputePopularity();
    this.recomputeReachable();
    this.seedStarterResort(cx, this.entrance.row);
  }

  /**
   * Lay down the resort the player starts with: a lobby to check in at and a
   * couple of facilities so there is something to do from the first minute.
   */
  private seedStarterResort(cx: number, entranceRow: number): void {
    const starters: [string, number, number][] = [
      ["Lobby", cx - 1, entranceRow - 6],
      ["Cottage", cx - 6, entranceRow - 6],
      ["Pool", cx + 3, entranceRow - 5],
      ["Icecream", cx + 2, entranceRow - 1],
    ];
    for (const [type, col, row] of starters) {
      if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) continue;
      const saved = this.money;
      this.money = Number.MAX_SAFE_INTEGER;
      this.placeBooth(type, col, row, true);
      this.money = saved;
    }
  }

  tileAt(col: number, row: number): Tile | null {
    if (col < 0 || row < 0 || col >= this.cols || row >= this.rows) return null;
    return this.tiles[row][col];
  }

  isWalkable(col: number, row: number): boolean {
    const t = this.tileAt(col, row);
    return !!t && t.walkable && t.booth === null;
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
        this.walkMask[r * this.cols + c] = t.walkable && t.booth === null ? 1 : 0;
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
    const cost = boothPrice(booth.type, booth.level + 1);
    if (this.money < cost) return false;
    this.money -= cost;
    booth.level++;
    this.recomputePopularity();
    this.log.push(`Upgraded ${booth.type} to level ${booth.level + 1}`);
    return true;
  }

  /** Can a booth of this type be placed with its corner at (col,row)? */
  canPlaceBooth(type: string, col: number, row: number): boolean {
    const def = boothDef(type);
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
    };
    for (let r = row; r < row + def.ROWS; r++) {
      for (let c = col; c < col + def.COLS; c++) {
        this.tiles[r][c].booth = type;
      }
    }
    this.booths.push(booth);
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
    return this.money >= sceneryDef(id).price;
  }

  placeScenery(id: string, col: number, row: number): boolean {
    if (!this.canPlaceScenery(id, col, row)) return false;
    const def = sceneryDef(id);
    this.money -= def.price;
    this.tiles[row][col].scenery = id;
    this.recomputePopularity();
    return true;
  }

  removeBooth(booth: BoothInstance): void {
    for (let r = booth.row; r < booth.row + booth.rows; r++) {
      for (let c = booth.col; c < booth.col + booth.cols; c++) {
        const t = this.tileAt(c, r);
        if (t) t.booth = null;
      }
    }
    this.booths = this.booths.filter((b) => b.id !== booth.id);
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
    // Plants add a little charm.
    for (const row of this.tiles) {
      for (const t of row) {
        if (t.scenery) total += sceneryDef(t.scenery).pop;
      }
    }
    this.popularityCache = total;
  }

  get guestCapacity(): number {
    return Math.max(4, Math.floor(this.popularity * 4));
  }

  // ---------------------------------------------------------- visitors ----

  private spawnVisitor(): void {
    const archetypes = DATA.visitor.Cottage as number[];
    const archetypePool = [
      "Cottage", "Lodge", "Old", "TanpaOld",
    ];
    const arch = archetypePool[
      Math.floor(Math.random() * archetypePool.length)
    ];
    const entryCol = this.entrance.col + (Math.random() < 0.5 ? -2 : 2);

    this.visitors.push({
      id: this.nextVisitorId++,
      col: entryCol,
      row: this.entrance.row,
      path: [],
      target: null,
      state: "arriving",
      mood: 55 + Math.random() * 20,
      budget: 150 + Math.random() * 350,
      spent: 0,
      archetype: arch,
      timer: 0,
      seed: Math.random(),
    });
    void archetypes;
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

  private pickTarget(visitor: Visitor): boolean {
    if (this.booths.length === 0) return false;
    // Weight the choice by popularity so popular facilities get busier.
    const weights = this.booths.map((b) => Math.max(0.05, boothPopularity(b.type, b.level)));
    const total = weights.reduce((a, b) => a + b, 0);
    let roll = Math.random() * total;
    let chosen = this.booths[0];
    for (let i = 0; i < this.booths.length; i++) {
      roll -= weights[i];
      if (roll <= 0) {
        chosen = this.booths[i];
        break;
      }
    }

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
        // Nothing reachable right now: mill about or leave.
        v.timer += dt;
        if (v.timer > 3) {
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
    if (v.path.length === 0) return;
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
    }
  }

  private completeVisit(v: Visitor, booth: BoothInstance): void {
    const def = boothDef(booth.type);
    const price = Array.isArray(def.booked_price)
      ? def.booked_price[Math.min(booth.level, def.booked_price.length - 1)]
      : def.booked_price;

    const charge = Math.min(price || 0, Math.max(0, v.budget - v.spent));
    v.spent += charge;
    this.money += charge;

    // Satisfaction depends on the booth's popularity and whether the guest
    // could afford the service.
    const pop = boothPopularity(booth.type, booth.level);
    const delta = 6 + pop * 4 + (charge > 0 ? 4 : -8);
    v.mood = Math.max(0, Math.min(100, v.mood + delta));

    booth.occupancy = Math.max(0, booth.occupancy - 1);
    booth.served++;
    booth.satisfaction =
      (booth.satisfaction * (booth.served - 1) + v.mood) / booth.served;

    // Research points accrue from satisfied guests.
    const rp = Math.round((v.mood / 100) * (def.xpt || 0) * 0.2);
    if (rp > 0) this.researchPoints += rp;

    v.target = null;
    v.state = "seeking";
    v.timer = 0;
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
  }

  // -------------------------------------------------------------- tick ----

  update(dt: number): void {
    this.time += dt;
    this.clockTick(dt);
    // Reset the per-frame pathfinding budget.
    this.pathBudget = 3;
    this.pathsQueued = 0;

    // Spawn new guests based on popularity, respecting capacity.
    if (this.isOpen && this.visitors.length < this.guestCapacity) {
      const rate = 0.22 + this.popularity * 0.05;
      if (Math.random() < rate * dt) this.spawnVisitor();
    }

    for (const v of this.visitors) {
      this.updateVisitor(v, dt);
    }
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
