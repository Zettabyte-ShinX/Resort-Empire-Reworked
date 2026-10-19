/**
 * Procedural isometric artwork.
 *
 * Everything here is drawn from primitives at runtime rather than loaded from
 * image files. That keeps the download tiny and lets us ship a consistent,
 * modern flat look without needing an art pipeline in place yet.
 *
 * Each function draws in *world* coordinates; the renderer applies the camera
 * transform before calling them.
 */

import { TILE_H, TILE_W, gridToScreen } from "../core/iso.ts";

export type Palette = {
  path: string;
  pathEdge: string;
  pathAlt: string[];
  grass: string;
  grassAlt: string[];
  grassEdge: string;
  water: string;
};

export const PALETTE: Palette = {
  path: "#8d97a3",
  pathEdge: "#78828e",
  pathAlt: ["#949eaa", "#87919d", "#909aa6", "#8b95a1"],
  grass: "#4f7a45",
  grassAlt: ["#547f49", "#4c7642", "#527d47", "#4a7340"],
  grassEdge: "#3f6637",
  water: "#3f6f9e",
};

function diamond(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x, y - h / 2);
  ctx.lineTo(x + w / 2, y);
  ctx.lineTo(x, y + h / 2);
  ctx.lineTo(x - w / 2, y);
  ctx.closePath();
}

/** A ground tile: a flat diamond with a subtle inset edge. */
export function drawTile(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  kind: "path" | "grass",
  variant: number,
): void {
  if (kind === "path") {
    ctx.fillStyle = PALETTE.pathAlt[variant % PALETTE.pathAlt.length];
    diamond(ctx, x, y, TILE_W, TILE_H);
    ctx.fill();
    ctx.strokeStyle = PALETTE.pathEdge;
    ctx.lineWidth = 0.6;
    ctx.stroke();
  } else {
    ctx.fillStyle = PALETTE.grassAlt[variant % PALETTE.grassAlt.length];
    diamond(ctx, x, y, TILE_W, TILE_H);
    ctx.fill();
    ctx.strokeStyle = PALETTE.grassEdge;
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }
}

/**
 * Scenery (plants). Each species gets its own silhouette so the resort reads
 * as varied without any sprite sheet.
 */
export function drawPlant(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  species: number,
  seed: number,
): void {
  const r = (n: number) => {
    const v = Math.sin(seed * 127.1 + n * 311.7) * 43758.5453;
    return v - Math.floor(v);
  };

  ctx.save();
  ctx.translate(x, y);

  // Soft shadow on the ground.
  ctx.fillStyle = "rgba(0,0,0,0.16)";
  ctx.beginPath();
  ctx.ellipse(0, 0, 7, 3.4, 0, 0, Math.PI * 2);
  ctx.fill();

  const kind = species % 4;
  if (kind === 0) {
    // Conifer.
    const h = 16 + r(1) * 6;
    ctx.fillStyle = "#6b4a2f";
    ctx.fillRect(-1.4, -h * 0.35, 2.8, h * 0.35);
    for (let i = 0; i < 3; i++) {
      const t = i / 3;
      ctx.fillStyle = i === 0 ? "#2f6b3c" : "#3a7a46";
      ctx.beginPath();
      ctx.moveTo(0, -h + t * h * 0.42);
      ctx.lineTo(6 - t * 1.6, -h * 0.32 + t * h * 0.42);
      ctx.lineTo(-(6 - t * 1.6), -h * 0.32 + t * h * 0.42);
      ctx.closePath();
      ctx.fill();
    }
  } else if (kind === 1) {
    // Palm.
    const h = 20 + r(2) * 8;
    ctx.strokeStyle = "#8a6a3f";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(2, -h * 0.6, 1, -h);
    ctx.stroke();
    ctx.strokeStyle = "#3f8a4a";
    ctx.lineWidth = 2.2;
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (i / 5 - 0.5) * 2.4;
      ctx.beginPath();
      ctx.moveTo(1, -h);
      ctx.quadraticCurveTo(
        1 + Math.cos(a) * 6,
        -h + Math.sin(a) * 5,
        1 + Math.cos(a) * 9,
        -h + Math.sin(a) * 9 + 2,
      );
      ctx.stroke();
    }
  } else if (kind === 2) {
    // Round shrub.
    const rr = 6 + r(3) * 3;
    ctx.fillStyle = "#3f7a3c";
    ctx.beginPath();
    ctx.arc(0, -rr * 0.8, rr, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.12)";
    ctx.beginPath();
    ctx.arc(-rr * 0.3, -rr * 1.1, rr * 0.5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Tall grass tuft.
    ctx.strokeStyle = "#5d8c4a";
    ctx.lineWidth = 1.3;
    for (let i = 0; i < 5; i++) {
      const a = -Math.PI / 2 + (i / 4 - 0.5) * 1.1;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(
        Math.cos(a) * 3,
        -5,
        Math.cos(a) * 6,
        -9 + (i % 2) * 2,
      );
      ctx.stroke();
    }
  }
  ctx.restore();
}

/** Colour used for each facility family. */
const BOOTH_COLORS: Record<string, { wall: string; roof: string; trim: string }> = {
  Lobby: { wall: "#d9c9a8", roof: "#b4583f", trim: "#8d4230" },
  Cottage: { wall: "#e6dcc6", roof: "#7f9bb5", trim: "#5d7890" },
  Lodge: { wall: "#e2d3ba", roof: "#8a6f9e", trim: "#66517a" },
  Sauna: { wall: "#c98d5c", roof: "#a4673d", trim: "#7d4d2c" },
  Gym: { wall: "#b9c4cf", roof: "#4f7fa8", trim: "#3a5f80" },
  Bar: { wall: "#d6b98c", roof: "#96422f", trim: "#6f3022" },
  Jacuzi: { wall: "#9fd0dd", roof: "#4f9bb3", trim: "#3a7a8e" },
  Arcade: { wall: "#d5c3e0", roof: "#7a5aa0", trim: "#5b3f7a" },
  IndiaResto: { wall: "#e5c98e", roof: "#c86a2e", trim: "#9a4f21" },
  Spa: { wall: "#dfe0e8", roof: "#8fa5b8", trim: "#6b8090" },
  JapanResto: { wall: "#eceae4", roof: "#b03a3a", trim: "#872b2b" },
  BaratResto: { wall: "#dfc6a3", roof: "#8c5a2b", trim: "#6b441f" },
  Medical: { wall: "#eef2f5", roof: "#5f97b8", trim: "#47738f" },
  Minimarket: { wall: "#e3ddc8", roof: "#4f8f66", trim: "#396b4d" },
  Pool: { wall: "#9fd8e8", roof: "#3f9ec9", trim: "#2f7ba0" },
  Golf: { wall: "#cfe0a8", roof: "#5f9a3f", trim: "#48762f" },
  Icecream: { wall: "#f6e0ea", roof: "#e08fb0", trim: "#b56d8b" },
  Hotdog: { wall: "#f0dcb8", roof: "#c9623a", trim: "#9a4a2b" },
  Taco: { wall: "#f2e0b6", roof: "#d09a3c", trim: "#a6782c" },
  Giftshop: { wall: "#e6d7ea", roof: "#a45ea8", trim: "#7d447f" },
  JanitorRoom: { wall: "#d6d8d2", roof: "#8d9187", trim: "#6b6f66" },
};

const DEFAULT_BOOTH_COLOR = { wall: "#cfc9bd", roof: "#8d8579", trim: "#6b6459" };

/** How tall a facility is drawn, in pixels. */
export function boothHeight(type: string): number {
  switch (type) {
    case "Pool":
      return 4;
    case "Golf":
      return 4;
    case "JanitorRoom":
      return 14;
    case "Lodge":
      return 30;
    case "Cottage":
      return 22;
    case "Arcade":
      return 24;
    default:
      return 20;
  }
}

/**
 * Draw a facility as an isometric box sitting on its footprint.
 */
export function drawBooth(
  ctx: CanvasRenderingContext2D,
  col: number,
  row: number,
  cols: number,
  rows: number,
  type: string,
  level: number,
): void {
  const h = boothHeight(type) + level * 3;
  const c = BOOTH_COLORS[type] ?? DEFAULT_BOOTH_COLOR;

  // Corner points of the footprint in world space.
  const nw = gridToScreen(col, row);
  const ne = gridToScreen(col + cols, row);
  const se = gridToScreen(col + cols, row + rows);
  const sw = gridToScreen(col, row + rows);

  // The footprint's "top face" is the diamond formed by those corners; the
  // visible sides are the south-east and south-west faces.
  const topY = -h;

  // South-west face.
  ctx.fillStyle = shade(c.wall, -0.16);
  ctx.beginPath();
  ctx.moveTo(sw.x, sw.y);
  ctx.lineTo(se.x, se.y);
  ctx.lineTo(se.x, se.y + topY);
  ctx.lineTo(sw.x, sw.y + topY);
  ctx.closePath();
  ctx.fill();

  // South-east face.
  ctx.fillStyle = shade(c.wall, -0.3);
  ctx.beginPath();
  ctx.moveTo(sw.x, sw.y);
  ctx.lineTo(nw.x, nw.y);
  ctx.lineTo(nw.x, nw.y + topY);
  ctx.lineTo(sw.x, sw.y + topY);
  ctx.closePath();
  ctx.fill();

  // Roof.
  ctx.fillStyle = c.roof;
  ctx.beginPath();
  ctx.moveTo(nw.x, nw.y + topY);
  ctx.lineTo(ne.x, ne.y + topY);
  ctx.lineTo(se.x, se.y + topY);
  ctx.lineTo(sw.x, sw.y + topY);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = c.trim;
  ctx.lineWidth = 1;
  ctx.stroke();

  // A hint of a door on the south-west face.
  if (type !== "Pool" && type !== "Golf") {
    ctx.fillStyle = shade(c.trim, -0.1);
    const dw = Math.max(3, 10 / cols);
    ctx.fillRect(
      (sw.x + se.x) / 2 - dw / 2,
      (sw.y + se.y) / 2 + topY,
      dw,
      Math.max(4, h * 0.55),
    );
  }
}

/** A guest: a small rounded figure with a coloured outfit. */
export function drawGuest(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  seed: number,
  mood: number,
): void {
  const r = (n: number) => {
    const v = Math.sin(seed * 91.7 + n * 47.3) * 43758.5453;
    return v - Math.floor(v);
  };
  const hue = Math.floor(r(1) * 360);
  const body = `hsl(${hue}, 55%, 58%)`;
  const dark = `hsl(${hue}, 55%, 42%)`;
  const skin = `hsl(${28 + r(2) * 14}, 45%, ${62 + r(3) * 12}%)`;

  ctx.save();
  ctx.translate(x, y);

  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath();
  ctx.ellipse(0, 0, 3.4, 1.7, 0, 0, Math.PI * 2);
  ctx.fill();

  // Body.
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.roundRect(-2.6, -8.5, 5.2, 8.5, 2);
  ctx.fill();

  // Head.
  ctx.fillStyle = skin;
  ctx.beginPath();
  ctx.arc(0, -10.4, 2.6, 0, Math.PI * 2);
  ctx.fill();

  // Hair.
  ctx.fillStyle = dark;
  ctx.beginPath();
  ctx.arc(0, -11.1, 2.6, Math.PI * 1.05, Math.PI * 2.05);
  ctx.fill();

  // Mood dot.
  if (mood >= 80) ctx.fillStyle = "#7ee07e";
  else if (mood >= 60) ctx.fillStyle = "#e0d97e";
  else if (mood >= 40) ctx.fillStyle = "#e0b47e";
  else ctx.fillStyle = "#e07e7e";
  ctx.beginPath();
  ctx.arc(3.4, -12.2, 1.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/** Lighten or darken a hex colour. */
export function shade(hex: string, amount: number): string {
  const m = hex.replace("#", "");
  const num = parseInt(m, 16);
  const r = Math.round(Math.min(255, Math.max(0, ((num >> 16) & 255) * (1 + amount))));
  const g = Math.round(Math.min(255, Math.max(0, ((num >> 8) & 255) * (1 + amount))));
  const b = Math.round(Math.min(255, Math.max(0, (num & 255) * (1 + amount))));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}
