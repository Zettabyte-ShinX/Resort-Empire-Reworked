/**
 * Isometric grid maths.
 *
 * The mapping matches the original game exactly, so the artwork extracted from
 * its SWF lands in the right place without any fudge factors. The original
 * places every object with `rumus.findTileCoord_point`, which is:
 *
 *     x = (row - col) * SIZE
 *     y = -(row + col) * SIZE / 2
 *
 * with `SIZE = 24`. That puts adjacent columns 24px apart, i.e. a 48px wide
 * diamond, and the screen Y axis grows upwards.
 *
 * Grid coordinates are `(col, row)`.
 */

/** Width of a tile diamond, in pixels. */
export const TILE_W = 48;
/** Height of a tile diamond, in pixels (half of the width for 2:1 iso). */
export const TILE_H = 24;

export interface Vec2 {
  x: number;
  y: number;
}

export interface GridPos {
  col: number;
  row: number;
}

/** Grid -> screen (pixels, relative to the map origin). */
export function gridToScreen(col: number, row: number): Vec2 {
  return {
    x: (row - col) * (TILE_W / 2),
    y: -(row + col) * (TILE_H / 2),
  };
}

/** Screen -> grid (fractional; round for the containing tile). */
export function screenToGrid(sx: number, sy: number): GridPos {
  const a = sx / (TILE_W / 2); // row - col
  const b = -sy / (TILE_H / 2); // row + col
  return {
    col: (b - a) / 2,
    row: (b + a) / 2,
  };
}

/** The four corners of a tile diamond, relative to its screen position. */
export function tileCorners(screenX: number, screenY: number): Vec2[] {
  const hw = TILE_W / 2;
  const hh = TILE_H / 2;
  return [
    { x: screenX, y: screenY - hh },
    { x: screenX + hw, y: screenY },
    { x: screenX, y: screenY + hh },
    { x: screenX - hw, y: screenY },
  ];
}

/**
 * Painter's-algorithm depth key.
 *
 * Objects further "south" (larger col+row) are drawn later so they overlap
 * the ones behind them.
 */
export function depthKey(col: number, row: number, height = 0): number {
  return col + row - height * 0.001;
}

/** Bounding box of the whole map in screen space. */
export function mapBounds(cols: number, rows: number): {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
} {
  const pts = [
    gridToScreen(0, 0),
    gridToScreen(cols, 0),
    gridToScreen(0, rows),
    gridToScreen(cols, rows),
  ];
  return {
    minX: Math.min(...pts.map((p) => p.x)),
    minY: Math.min(...pts.map((p) => p.y)),
    maxX: Math.max(...pts.map((p) => p.x)),
    maxY: Math.max(...pts.map((p) => p.y)),
  };
}
