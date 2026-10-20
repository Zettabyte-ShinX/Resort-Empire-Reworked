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
import { tileDef } from "../core/data.ts";
import type { World } from "../core/world.ts";
import { drawBooth, drawGuest, drawPlant, drawTile } from "./art.ts";
import { art } from "./sprites.ts";
import type { SpriteFrame } from "./sprites.ts";

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
): boolean {
  if (!frame) return false;
  const img = art.image(frame.file);
  if (!img || !img.complete || img.naturalWidth === 0) return false;
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
        }
      }
    }

    for (let r = 0; r < world.rows; r++) {
      for (let col = 0; col < world.cols; col++) {
        const tile = world.tiles[r]![col]!;
        const p = gridToScreen(col, r);
        const def = tileDef(tile.id);
        const frame = art.frameFor("tiles", def.fr);
        const drawn = frame ? drawSprite(c, frame, p.x, p.y, artScale) : false;
        if (!drawn) {
          drawTile(c, p.x, p.y, def.mainJenis === 1 ? "grass" : "path", 0);
        }
      }
    }

    // Scenery, drawn back to front so nearer plants overlap farther ones.
    const plants: { col: number; row: number; species: number; seed: number }[] = [];
    for (let r = 0; r < world.rows; r++) {
      for (let col = 0; col < world.cols; col++) {
        const tile = world.tiles[r]![col]!;
        if (!tile.scenery) continue;
        plants.push({
          col,
          row: r,
          species: Number(tile.scenery.replace(/\D/g, "")) || 0,
          seed: (col * 37 + r * 91) % 997,
        });
      }
    }
    plants.sort((a, b) => a.col + a.row - (b.col + b.row));
    for (const p of plants) {
      const s = gridToScreen(p.col, p.row);
      const def = this.sceneryFrame(p.species);
      const drawn = def ? drawSprite(c, def, s.x, s.y, artScale) : false;
      if (!drawn) drawPlant(c, s.x, s.y, p.species, p.seed);
    }

    this.staticZoom = zoom;
    this.staticDirty = false;
  }

  /** The plant graphic for a species number, from the original's frame set. */
  private sceneryFrame(species: number): SpriteFrame | undefined {
    const entry = art.frameSet("plants");
    if (!entry || entry.frames.length === 0) return undefined;
    const idx = Math.max(0, Math.min(entry.frames.length - 1, species));
    return entry.frames[idx];
  }

  // ------------------------------------------------------------- render ---

  render(world: World, highlight?: { col: number; row: number; valid: boolean }): void {
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

    for (const b of world.booths) {
      const entry = art.booth(b.type);
      const frame = entry?.frames[0];
      // The original anchors a booth on the corner tile of its footprint and
      // places the clip's origin there, so the building grows upwards from it.
      const anchor = gridToScreen(b.col, b.row + b.rows - 1);
      const depth = b.col + b.row + (b.cols + b.rows) / 2;
      items.push({
        depth,
        draw: () => {
          const ok = frame ? drawSprite(ctx, frame, anchor.x, anchor.y, artScale) : false;
          if (!ok) {
            drawBooth(ctx, b.col, b.row, b.cols, b.rows, b.type, b.level);
          }
        },
      });
    }

    for (const v of world.visitors) {
      const p = gridToScreen(v.col, v.row);
      const entry = art.visitor(variantFor(v));
      const frame = entry?.frames[0];
      items.push({
        depth: v.col + v.row,
        draw: () => {
          const ok = frame ? drawSprite(ctx, frame, p.x, p.y, artScale) : false;
          if (!ok) drawGuest(ctx, p.x, p.y, v.seed, v.mood);
        },
      });
    }

    items.sort((a, b) => a.depth - b.depth);
    for (const it of items) it.draw();

    // Tile highlight for the build cursor.
    if (highlight) {
      const p = gridToScreen(highlight.col, highlight.row);
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - TILE_H / 2);
      ctx.lineTo(p.x + TILE_W / 2, p.y);
      ctx.lineTo(p.x, p.y + TILE_H / 2);
      ctx.lineTo(p.x - TILE_W / 2, p.y);
      ctx.closePath();
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
function variantFor(v: { seed: number }): number {
  return 1 + Math.floor(v.seed * 29) % 29;
}
