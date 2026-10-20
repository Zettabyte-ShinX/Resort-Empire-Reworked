/**
 * Canvas renderer for the resort.
 *
 * Performance notes (this has to run on a low-end Celeron):
 *  - The ground layer (tiles + scenery) is rendered once into an offscreen
 *    canvas and blitted, so a 1369 tile map costs one drawImage per frame.
 *  - The offscreen layer is re-rendered only when the map changes or the
 *    zoom level changes, which keeps it crisp without per-frame cost.
 *  - Only entities (facilities and guests) are sorted and drawn per frame.
 *
 * The artwork itself is the original game's, extracted from its SWF. See
 * `sprites.ts` for how the assets are loaded and how anchors are applied.
 */

import { TILE_H, TILE_W, gridToScreen, mapBounds, screenToGrid } from "../core/iso.ts";
import type { GridPos } from "../core/iso.ts";
import { boothDef, sceneryDef, tileDef } from "../core/data.ts";

/** The hedge the original draws around the buildable plot. */
export const HEDGE = "HEDGE";
/**
 * The frame of the original's `Scenery` clip that draws the plot's hedge.
 *
 * It is the same model as the "corner plant" the original scatters around
 * the map: a block of greenery.
 */
const HEDGE_FRAME = 10;

/**
 * The staff each facility employs, from the original's own clips.
 *
 * The lobby's receptionists are part of the lobby's artwork, so it has no
 * separate staff clip.
 */
const FACILITY_STAFF: Record<string, string> = {
  Bar: "EmpBar_302",
  BaratResto: "emp_JapanResto_291",
  Giftshop: "employeeGiftshop_309",
  IndiaResto: "emp_IndiaResto_284",
  JapanResto: "emp_JapanResto_291",
  Medical: "emp_medical_335",
  Minimarket: "emp_Minimarket_331",
  Spa: "EmployeeSpa_352",
};

/**
 * The clip the original shows for a guest using a facility.
 *
 * The original has a clip per facility and per guest, showing the guest
 * sitting in a cottage, swimming in the pool and so on.
 */
const FACILITY_GUEST: Record<string, string> = {
  Arcade: "vcustomer1_arcade_277",
  Cottage: "vcustomer1_cottage_139",
  Golf: "vcustomer1_golf_146",
  Gym: "vcustomer1_gym_365",
  Jacuzi: "vcustomer1_jacuzi_324",
  Lodge: "vcustomer1_lodge_45",
  Medical: "vcustomer1_medical_342",
  Minimarket: "vcustomer1_Minimarket_330",
  Pool: "vcustomer1_poo_204",
  Sauna: "vcustomer1_sauna_347",
  Spa: "vcustomer1_spa_357",
};
import type { World } from "../core/world.ts";
import { drawBooth, drawGuest, drawPlant, drawTile } from "./art.ts";
import { art } from "./sprites.ts";
import type { SpriteEntry, SpriteFrame } from "./sprites.ts";

export interface Camera {
  /** World-space centre of the view. */
  x: number;
  y: number;
  zoom: number;
}

interface Renderable {
  depth: number;
  draw: () => void;
}

/** Draw an extracted sprite so that its Flash origin lands on (x, y). */
function drawSprite(
  ctx: CanvasRenderingContext2D,
  frame: SpriteFrame | undefined,
  x: number,
  y: number,
  scale = 1,
  flip = false,
): boolean {
  if (!frame) return false;
  const img = art.image(frame.file);
  if (!img || !img.complete || img.naturalWidth === 0) return false;
  if (flip) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(-1, 1);
    ctx.drawImage(
      img,
      -frame.ox * scale,
      -frame.oy * scale,
      frame.w * scale,
      frame.h * scale,
    );
    ctx.restore();
    return true;
  }
  ctx.drawImage(
    img,
    x - frame.ox * scale,
    y - frame.oy * scale,
    frame.w * scale,
    frame.h * scale,
  );
  return true;
}

export class Renderer {
  readonly canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private staticCanvas: HTMLCanvasElement;
  private staticCtx: CanvasRenderingContext2D;
  private staticZoom = -1;
  private staticDirty = true;
  private dpr = 1;
  width = 0;
  height = 0;
  camera: Camera = { x: 0, y: 0, zoom: 1 };

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) throw new Error("2d context unavailable");
    this.ctx = ctx;

    this.staticCanvas = document.createElement("canvas");
    const sctx = this.staticCanvas.getContext("2d");
    if (!sctx) throw new Error("2d context unavailable");
    this.staticCtx = sctx;
  }

  markDirty(): void {
    this.staticDirty = true;
  }

  /** Change the mouse cursor over the canvas. */
  setCursor(cursor: string): void {
    this.canvas.style.cursor = cursor;
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.width = Math.max(1, Math.floor(rect.width));
    this.height = Math.max(1, Math.floor(rect.height));
    this.canvas.width = Math.floor(this.width * this.dpr);
    this.canvas.height = Math.floor(this.height * this.dpr);
  }

  // ------------------------------------------------------- coordinates ---

  /** Convert a canvas pixel position to world space. */
  screenToWorld(px: number, py: number): { x: number; y: number } {
    const cam = this.camera;
    return {
      x: (px - this.width / 2) / cam.zoom + cam.x,
      y: (py - this.height / 2) / cam.zoom + cam.y,
    };
  }

  /** Convert world space to canvas pixel position. */
  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    const cam = this.camera;
    return {
      x: (wx - cam.x) * cam.zoom + this.width / 2,
      y: (wy - cam.y) * cam.zoom + this.height / 2,
    };
  }

  /** Which tile is under this canvas pixel? */
  pickTile(px: number, py: number): GridPos {
    const w = this.screenToWorld(px, py);
    const g = screenToGrid(w.x, w.y);
    return { col: Math.floor(g.col), row: Math.floor(g.row) };
  }

  // --------------------------------------------------------- static layer --

  private buildStaticLayer(world: World): void {
    const zoom = this.camera.zoom;
    const bounds = mapBounds(world.cols, world.rows);
    const pad = 64;

    const w = Math.ceil((bounds.maxX - bounds.minX + pad * 2) * zoom);
    const h = Math.ceil((bounds.maxY - bounds.minY + pad * 2) * zoom);
    this.staticCanvas.width = Math.max(1, w);
    this.staticCanvas.height = Math.max(1, h);

    const c = this.staticCtx;
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.clearRect(0, 0, w, h);
    c.setTransform(
      zoom, 0, 0, zoom,
      -bounds.minX * zoom + pad * zoom,
      -bounds.minY * zoom + pad * zoom,
    );

    // Ground. The art is the original's, drawn with the sprite's own origin
    // on the grid point, exactly as the original places it.
    const artScale = 0.5; // the exported PNGs are at twice the original size

    // The buildable plot is floored with the original's sand texture. The
    // texture is a single tile, so it is lined up with the tile artwork's own
    // diamond rather than with the grid point.
    const sand = art.imageAsset("sandFloor");
    const sandTile = art.frameFor("tiles", tileDef("TILE_80").fr);
    if (sand && sand.complete && sand.naturalWidth > 0 && sandTile) {
      const offX = (sandTile.w / 2 - sandTile.ox) * artScale;
      const offY = (sandTile.h / 2 - sandTile.oy) * artScale;
      for (let r = 0; r < world.rows; r++) {
        for (let col = 0; col < world.cols; col++) {
          if (world.tiles[r]![col]!.id !== "TILE_80") continue;
          const p = gridToScreen(col, r);
          c.drawImage(
            sand,
            p.x + offX - sand.naturalWidth / 2,
            p.y + offY - sand.naturalHeight / 2,
            sand.naturalWidth,
            sand.naturalHeight,
          );
          // The original marks out the tiles of the plot, so the ground
          // reads as separate tiles rather than one flat sheet.
          drawSprite(c, sandTile, p.x, p.y, artScale);
        }
      }
    }

    for (let r = 0; r < world.rows; r++) {
      for (let col = 0; col < world.cols; col++) {
        const tile = world.tiles[r]![col]!;
        const p = gridToScreen(col, r);
        const def = tileDef(tile.id);
        // The plot's sand is drawn underneath; the original marks the
        // buildable tiles with an outline, but a built-out resort looks
        // better without them.
        if (tile.id === "TILE_80") continue;
        const frame = art.frameFor("tiles", def.fr);
        const drawn = frame ? drawSprite(c, frame, p.x, p.y, artScale) : false;
        if (!drawn) {
          drawTile(c, p.x, p.y, def.mainJenis === 1 ? "grass" : "path", 0);
        }
      }
    }

    // Scenery, drawn back to front so nearer plants overlap farther ones.
    const plants: { col: number; row: number; species: string; seed: number }[] = [];
    for (let r = 0; r < world.rows; r++) {
      for (let col = 0; col < world.cols; col++) {
        const tile = world.tiles[r]![col]!;
        if (!tile.scenery) continue;
        plants.push({
          col,
          row: r,
          species: tile.scenery,
          seed: (col * 37 + r * 91) % 997,
        });
      }
    }
    plants.sort((a, b) => a.col + a.row - (b.col + b.row));
    for (const p of plants) {
      const s = gridToScreen(p.col, p.row);
      const def = this.sceneryFrame(p.species);
      const drawn = def ? drawSprite(c, def, s.x, s.y, artScale) : false;
      if (!drawn) {
        const fallback = Number(p.species.replace(/\D/g, "")) || 0;
        drawPlant(c, s.x, s.y, fallback, p.seed);
      }
    }

    this.staticZoom = zoom;
    this.staticDirty = false;
  }

  /**
   * Where a facility's artwork is anchored on the map.
   *
   * The original's floors are drawn from a fixed offset in the sprite, so
   * lining the visible artwork up with the middle of the footprint is what
   * puts the floor on its tiles. The room and the building are drawn from
   * the same point, which is how the original keeps them together.
   */
  private boothAnchor(
    b: { col: number; row: number; cols: number; rows: number },
    floor: SpriteFrame | undefined,
    scale: number,
  ): { x: number; y: number } {
    const centre = gridToScreen(b.col + b.cols / 2, b.row + b.rows / 2);
    if (!floor || !floor.bbox) {
      const west = gridToScreen(b.col + b.cols, b.row);
      return { x: west.x, y: west.y + 12 };
    }
    const [x0, y0, x1, y1] = floor.bbox;
    const artX = ((x0 + x1) / 2 - floor.ox) * scale;
    const artY = ((y0 + y1) / 2 - floor.oy) * scale;
    return { x: centre.x - artX, y: centre.y - artY };
  }

  /**
   * The room a facility shows when it has a guest in it.
   *
   * The original has a clip for the rooms that can hold two guests, with a
   * frame for a single room and one for a double one.
   */
  private roomFrame(booth: { type: string; level: number; occupancy: number }): SpriteFrame | undefined {
    if (booth.occupancy <= 0) return undefined;
    const name =
      booth.type === "Cottage"
        ? "booth_selimutRoom_cottage_132"
        : booth.type === "Spa"
          ? "booth_selimutSpa_359"
          : null;
    if (!name) return undefined;
    const entry = art.named(name);
    if (!entry) return undefined;
    const level = Math.min(3, booth.level + 1);
    const single = art.frameByLabel(entry, `level_${level}_single`);
    const double = art.frameByLabel(entry, `level_${level}_double`);
    return booth.occupancy > 1 ? (double ?? single) : (single ?? double);
  }

  /**
   * The site the original shows while a facility is being built.
   *
   * It has one clip for every footprint size, with the workers standing on
   * the plot.
   */
  private buildSiteClip(booth: { rows: number; cols: number }): SpriteFrame | undefined {
    const sizes: Record<string, string> = {
      "1_1": "BuildProgress4",
      "2_2": "BuildProgress1",
      "2_3": "BuildProgress2",
      "3_3": "BuildProgress5",
      "3_4": "BuildProgress3",
      "4_4": "BuildProgress6",
    };
    const name = sizes[`${booth.cols}_${booth.rows}`];
    if (!name) return undefined;
    return art.named(name)?.frames[0];
  }

  /**
   * The frame of the original's building site for a facility.
   *
   * The original plays a clip of the site being built, and puts one scaffold
   * on every tile of the plot.
   */
  private buildSiteFrame(progress: number): SpriteFrame | undefined {
    const entry = art.named("buildprogressindoor_178");
    if (!entry || entry.frames.length === 0) return undefined;
    const idx = Math.max(
      0,
      Math.min(entry.frames.length - 1, Math.floor(progress * entry.frames.length)),
    );
    return entry.frames[idx];
  }

  /**
   * A frame from one of the original's animations.
   *
   * The clips name their animations - `stand`, `anim`, `v1_duduk` - and the
   * frames of an animation run from its name to the next one.
   */
  private animatedFrame(
    entry: SpriteEntry | undefined,
    phase: number,
    label: string,
  ): SpriteFrame | undefined {
    if (!entry || entry.frames.length === 0) return undefined;
    const start = entry.frames.findIndex((f) => f.label === label);
    if (start < 0) return entry.frames[0];
    let end = entry.frames.length;
    for (let i = start + 1; i < entry.frames.length; i++) {
      if (entry.frames[i]!.label) {
        end = i;
        break;
      }
    }
    const count = Math.max(1, end - start);
    return entry.frames[start + (Math.floor(phase) % count)];
  }

  /**
   * The artwork the original uses for a guest inside a facility.
   *
   * Each facility has a clip showing what a guest does there: sitting in a
   * cottage, swimming in the pool.
   */
  private facilityGuestFrame(type: string, phase: number): SpriteFrame | undefined {
    const name = FACILITY_GUEST[type];
    if (!name) return undefined;
    const entry = art.named(name);
    if (!entry) return undefined;
    for (const label of ["v1_place", "v1_duduk", "v1_anim", "v1_swim"]) {
      const frame = this.animatedFrame(entry, phase, label);
      if (frame && frame.label === label) return frame;
    }
    return entry.frames[0];
  }

  /** The plant graphic for a species, from the original's frame set. */
  private sceneryFrame(species: string): SpriteFrame | undefined {
    const entry = art.frameSet("plants");
    if (!entry || entry.frames.length === 0) return undefined;
    // The original addresses plant art by the frame number recorded in the
    // data, not by the species index. The hedge is the corner plant: the
    // original rings the plot with rows of green blocks.
    const fr = species === HEDGE ? HEDGE_FRAME : sceneryDef(species).fr;
    const idx = Math.max(0, Math.min(entry.frames.length - 1, fr - 1));
    return entry.frames[idx];
  }

  // ------------------------------------------------------------- render ---

  render(
    world: World,
    highlight?: { col: number; row: number; valid: boolean; cols?: number; rows?: number },
  ): void {
    const ctx = this.ctx;
    const cam = this.camera;

    if (this.staticDirty || this.staticZoom !== cam.zoom) {
      this.buildStaticLayer(world);
    }

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.fillStyle = "#1d2a24";
    ctx.fillRect(0, 0, this.width, this.height);

    // Blit the ground layer, aligned so world coordinates line up.
    const bounds = mapBounds(world.cols, world.rows);
    const pad = 64;
    const originX = bounds.minX - pad;
    const originY = bounds.minY - pad;
    const blit = this.worldToScreen(originX, originY);
    ctx.imageSmoothingEnabled = cam.zoom < 1;
    ctx.drawImage(
      this.staticCanvas,
      Math.round(blit.x),
      Math.round(blit.y),
      this.staticCanvas.width,
      this.staticCanvas.height,
    );

    // World transform for dynamic entities.
    ctx.setTransform(
      this.dpr * cam.zoom,
      0,
      0,
      this.dpr * cam.zoom,
      this.dpr * (this.width / 2 - cam.x * cam.zoom),
      this.dpr * (this.height / 2 - cam.y * cam.zoom),
    );

    const artScale = 0.5;
    const items: Renderable[] = [];
    // The staff and the guests work to the resort's clock, so their
    // animations stop when the game is paused.
    const phase = (world.day * 24 + world.hour) * 26;
    // Where each facility is drawn from, so a guest inside it can be placed
    // in the same spot.
    const anchors = new Map<number, { x: number; y: number }>();

    for (const b of world.booths) {
      const def = boothDef(b.type);
      // Each facility has its own artwork per upgrade level.
      const frame = art.boothFrame(b.type, b.level);
      const floorFrame = art.boothTileFrame(def.fr, b.level);
      // The room the facility is built in, from the original's `Wall` clip.
      const wallFrame = def.standbooth
        ? undefined
        : art.wallFrame(def.wall, b.level);
      // The original draws a facility's floor, room and building from one
      // shared origin, so they keep the arrangement the artist gave them. The
      // floor is lined up with the footprint it belongs to, and the room and
      // the building follow it.
      const anchor = this.boothAnchor(b, floorFrame, artScale);
      anchors.set(b.id, anchor);
      const depth = b.col + b.row + (b.cols + b.rows) / 2;
      // The employee works inside the facility.
      const staffEntry = FACILITY_STAFF[b.type] ? art.named(FACILITY_STAFF[b.type]) : undefined;
      const staffFrame = this.animatedFrame(staffEntry, phase, "anim");
      // A room with two guests in it shows the second bed as well.
      const roomFrame = this.roomFrame(b);
      // A facility under construction shows the original's building site.
      const siteFrame = b.building ? this.buildSiteFrame(b.buildProgress) : undefined;
      // The original has a site clip for every footprint size, with the
      // workers standing on it.
      const siteClip = b.building ? this.buildSiteClip(b) : undefined;
      items.push({
        depth,
        draw: () => {
          if (siteClip) {
            drawSprite(ctx, siteClip, anchor.x, anchor.y, artScale);
          } else if (floorFrame) {
            drawSprite(ctx, floorFrame, anchor.x, anchor.y, artScale);
          }
          if (siteFrame) {
            // The original puts one scaffold on every tile of the site.
            for (let r = 0; r < b.rows; r++) {
              for (let c = 0; c < b.cols; c++) {
                const p = gridToScreen(b.col + c, b.row + r);
                drawSprite(ctx, siteFrame, p.x, p.y + 12, artScale);
              }
            }
          }
          if (wallFrame && !b.building) {
            drawSprite(ctx, wallFrame, anchor.x, anchor.y, artScale);
          }
          if (roomFrame) {
            drawSprite(ctx, roomFrame, anchor.x, anchor.y, artScale);
          }
          if (staffFrame && !b.building) {
            drawSprite(ctx, staffFrame, anchor.x, anchor.y, artScale);
          }
          const ok =
            !b.building && frame ? drawSprite(ctx, frame, anchor.x, anchor.y, artScale) : false;
          if (!ok && !b.building) {
            drawBooth(ctx, b.col, b.row, b.cols, b.rows, b.type, b.level);
          }
        },
      });
    }

    for (const v of world.visitors) {
      const p = gridToScreen(v.col, v.row);
      const entry = art.visitor(variantFor(v));
      // The guest artwork has a pose for standing and walking, facing towards
      // or away from the camera, and is mirrored to face the way it walks.
      const pose = v.moving ? "walk" : "stand";
      const facing = v.dirY < 0 ? "back" : "front";
      const frame =
        art.frameByLabel(entry, `${pose}_${facing}`) ??
        art.frameByLabel(entry, "stand_front") ??
        entry?.frames[0];
      const flip = v.dirX < 0 || (v.dirX === 0 && v.dirY > 0);
      // A guest using a facility is drawn with the original's clip for that
      // facility, so they sit in the cottage or swim in the pool. The clip is
      // drawn from the facility's own anchor, which is where the room is.
      const using =
        v.state === "using" && v.target ? this.facilityGuestFrame(v.target.type, phase) : undefined;
      const usingAt = using && v.target ? anchors.get(v.target.id) ?? p : p;
      items.push({
        depth: v.col + v.row,
        draw: () => {
          if (using) {
            drawSprite(ctx, using, usingAt.x, usingAt.y, artScale);
            return;
          }
          const ok = frame ? drawSprite(ctx, frame, p.x, p.y, artScale, flip) : false;
          if (!ok) drawGuest(ctx, p.x, p.y, v.seed, v.mood);
        },
      });
    }

    // Litter left on the ground, and the janitor that picks it up.
    const litterArt = art.named("Sampah");
    if (litterArt) {
      for (const [key, amount] of world.litter) {
        const [c, r] = key.split(",").map(Number);
        const p = gridToScreen(c!, r!);
        const frame = litterArt.frames[Math.min(litterArt.frames.length - 1, amount - 1)];
        items.push({
          depth: c! + r! - 0.1,
          draw: () => {
            drawSprite(ctx, frame, p.x, p.y, artScale);
          },
        });
      }
    }
    if (world.janitor) {
      const entry = art.booth("Janitor");
      const frame =
        (world.janitor.working > 0
          ? art.frameByLabel(entry, "work_front")
          : art.frameByLabel(entry, "walk_front")) ??
        art.frameByLabel(entry, "stand_front") ??
        entry?.frames[0];
      const p = gridToScreen(world.janitor.col, world.janitor.row);
      items.push({
        depth: world.janitor.col + world.janitor.row,
        draw: () => {
          drawSprite(ctx, frame, p.x, p.y, artScale);
        },
      });
    }

    items.sort((a, b) => a.depth - b.depth);
    for (const it of items) it.draw();

    // Tile highlight for the build cursor. A facility covers a whole
    // footprint, so all of it is marked.
    if (highlight) {
      const w = highlight.cols ?? 1;
      const h = highlight.rows ?? 1;
      ctx.save();
      ctx.beginPath();
      for (let r = 0; r < h; r++) {
        for (let c = 0; c < w; c++) {
          const p = gridToScreen(highlight.col + c, highlight.row + r);
          ctx.moveTo(p.x, p.y - TILE_H / 2);
          ctx.lineTo(p.x + TILE_W / 2, p.y);
          ctx.lineTo(p.x, p.y + TILE_H / 2);
          ctx.lineTo(p.x - TILE_W / 2, p.y);
          ctx.closePath();
        }
      }
      ctx.fillStyle = highlight.valid
        ? "rgba(120, 230, 140, 0.30)"
        : "rgba(230, 110, 110, 0.32)";
      ctx.fill();
      ctx.strokeStyle = highlight.valid
        ? "rgba(150,255,170,0.85)"
        : "rgba(255,140,140,0.9)";
      ctx.lineWidth = 1.4 / cam.zoom;
      ctx.stroke();
      ctx.restore();
    }
  }

  /** Centre the camera on the middle of the map. */
  focusMap(world: World): void {
    const b = mapBounds(world.cols, world.rows);
    this.camera.x = (b.minX + b.maxX) / 2;
    this.camera.y = (b.minY + b.maxY) / 2;
  }

  /** Centre the map and choose a zoom that shows the whole resort. */
  fitMap(world: World): void {
    this.focusMap(world);
    const b = mapBounds(world.cols, world.rows);
    const mapW = b.maxX - b.minX;
    const mapH = b.maxY - b.minY;
    const zoom = Math.min(this.width / (mapW + 120), this.height / (mapH + 200));
    this.camera.zoom = Math.max(0.3, Math.min(4, zoom));
  }
}

/** Pick a guest sprite variant, spread over the available artwork. */
function variantFor(v: { variant: number }): number {
  return v.variant;
}
