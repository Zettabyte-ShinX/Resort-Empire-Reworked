/**
 * A* pathfinding over the isometric grid.
 *
 * This is a hot path: every guest runs a search whenever it picks a new
 * target, several times a second with a dozen guests on screen. It is
 * therefore written for a very weak CPU (the target machine is a 1.6GHz
 * Celeron, where allocating a single 10k element Float32Array costs about a
 * quarter of a millisecond).
 *
 * Two things keep it fast:
 *  - The scratch buffers are allocated once and reused. Freshness is tracked
 *    with a generation stamp, so no buffer ever has to be cleared.
 *  - The heap is manipulated inline. Closures over the scratch buffers stop
 *    V8 optimising the loop, which on this hardware costs more than the
 *    search itself.
 */

import type { GridPos } from "./iso.ts";

export interface PathBounds {
  cols: number;
  rows: number;
}

export interface PathOptions {
  /**
   * Walkability bitmap, one byte per tile in row-major order.
   *
   * A bitmap rather than a callback: a callback that is recreated for every
   * call makes the call site megamorphic, which stops V8 inlining it and
   * costs more than the search itself on a weak CPU.
   */
  mask: Uint8Array;
  /** Optional extra cost, e.g. distance from a road. */
  cost?: (col: number, row: number) => number;
  /** The extent of the map. Searches never leave it. */
  bounds: PathBounds;
  /** Maximum number of tiles to expand before giving up. */
  maxNodes?: number;
}

const DIRS = new Int8Array([
  1, 0, -1, 0, 0, 1, 0, -1,
  1, 1, 1, -1, -1, 1, -1, -1,
]);

// ---------------------------------------------------------------- scratch ---
// Allocated once and grown on demand. `generation` marks which tiles hold
// data from the current search, so the buffers never need clearing.

let capacity = 0;
let gScore = new Float32Array(0);
let gGen = new Int32Array(0);
let closedGen = new Int32Array(0);
let parent = new Int32Array(0);
let heap = new Int32Array(0);
let heapF = new Float32Array(0);
let generation = 0;

function ensureCapacity(size: number): void {
  if (size <= capacity) return;
  const next = Math.max(256, size * 2);
  capacity = next;
  gScore = new Float32Array(next);
  gGen = new Int32Array(next).fill(-1);
  closedGen = new Int32Array(next).fill(-1);
  parent = new Int32Array(next);
  heap = new Int32Array(next * 8 + 16);
  heapF = new Float32Array(next * 8 + 16);
}

/** Octile distance: the exact cost of the eight-way movement we allow. */
function heuristic(dc: number, dr: number): number {
  const ax = dc < 0 ? -dc : dc;
  const ay = dr < 0 ? -dr : dr;
  return ax + ay + (Math.SQRT2 - 2) * (ax < ay ? ax : ay);
}

/**
 * Find a path from `start` to `goal`.
 *
 * Returns the list of tiles to visit, excluding the start tile, or `null` when
 * no route exists. The path is simplified by dropping collinear steps so
 * guests walk in straight lines rather than stair-stepping.
 */
export function findPath(
  start: GridPos,
  goal: GridPos,
  opts: PathOptions,
): GridPos[] | null {
  const { mask, bounds } = opts;
  const { cols, rows } = bounds;
  if (cols <= 0 || rows <= 0) return null;
  if (
    start.col < 0 || start.row < 0 || start.col >= cols || start.row >= rows ||
    goal.col < 0 || goal.row < 0 || goal.col >= cols || goal.row >= rows
  ) {
    return null;
  }
  if (start.col === goal.col && start.row === goal.row) return [];

  const size = cols * rows;
  ensureCapacity(size);
  const maxNodes = Math.min(opts.maxNodes ?? size * 4, size * 4);

  const gen = ++generation;
  let heapSize = 0;

  const startIdx = start.row * cols + start.col;
  const goalIdx = goal.row * cols + goal.col;

  gScore[startIdx] = 0;
  gGen[startIdx] = gen;
  // The start node has no parent. Without this the reconstruction would walk
  // into a stale pointer left over from an earlier search.
  parent[startIdx] = -1;

  // ---- push start ----
  heap[0] = startIdx;
  heapF[0] = heuristic(goal.col - start.col, goal.row - start.row);
  heapSize = 1;

  let expanded = 0;

  while (heapSize > 0) {
    // ---- pop the cheapest entry ----
    const current = heap[0]!;
    heapSize--;
    if (heapSize > 0) {
      heap[0] = heap[heapSize]!;
      heapF[0] = heapF[heapSize]!;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < heapSize && heapF[l]! < heapF[m]!) m = l;
        if (r < heapSize && heapF[r]! < heapF[m]!) m = r;
        if (m === i) break;
        const t = heap[m]!;
        const tf = heapF[m]!;
        heap[m] = heap[i]!;
        heapF[m] = heapF[i]!;
        heap[i] = t;
        heapF[i] = tf;
        i = m;
      }
    }

    if (current === goalIdx) {
      return simplify(reconstruct(goalIdx, cols, parent, gen));
    }
    if (closedGen[current] === gen) continue;
    closedGen[current] = gen;
    if (++expanded > maxNodes) return null;

    const cc = current % cols;
    const cr = (current - cc) / cols;
    const g = gScore[current]!;

    for (let d = 0; d < 16; d += 2) {
      const dc = DIRS[d]!;
      const dr = DIRS[d + 1]!;
      const nc = cc + dc;
      const nr = cr + dr;
      if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue;
      // Do not cut corners diagonally past a blocked tile.
      if (dc !== 0 && dr !== 0) {
        const a = cr * cols + (cc + dc);
        const b = (cr + dr) * cols + cc;
        if (!mask[a] || !mask[b]) continue;
      }
      const ni = nr * cols + nc;
      if (!mask[ni]) continue;
      if (closedGen[ni] === gen) continue;

      const step = dc !== 0 && dr !== 0 ? Math.SQRT2 : 1;
      const ng = g + step + (opts.cost ? opts.cost(nc, nr) : 0);
      if (gGen[ni] === gen && gScore[ni]! <= ng) continue;

      gScore[ni] = ng;
      gGen[ni] = gen;
      parent[ni] = current;

      // ---- push the improved entry ----
      if (heapSize >= heap.length) continue; // never corrupt the heap
      let k = heapSize++;
      heap[k] = ni;
      heapF[k] = ng + heuristic(goal.col - nc, goal.row - nr);
      while (k > 0) {
        const p = (k - 1) >> 1;
        if (heapF[p]! <= heapF[k]!) break;
        const t = heap[p]!;
        const tf = heapF[p]!;
        heap[p] = heap[k]!;
        heapF[p] = heapF[k]!;
        heap[k] = t;
        heapF[k] = tf;
        k = p;
      }
    }
  }
  return null;
}

function reconstruct(
  goalIdx: number,
  cols: number,
  parentBuf: Int32Array,
  gen: number,
): GridPos[] {
  const out: GridPos[] = [];
  let cur = goalIdx;
  let guard = 0;
  while (cur !== -1 && guard++ < 100000) {
    const c = cur % cols;
    out.push({ col: c, row: (cur - c) / cols });
    cur = parentBuf[cur]!;
  }
  void gen;
  out.reverse();
  out.shift(); // drop the start tile
  return out;
}

/** Drop intermediate tiles that lie on a straight line between neighbours. */
function simplify(path: GridPos[]): GridPos[] {
  if (path.length < 3) return path;
  const out: GridPos[] = [path[0]!];
  for (let i = 1; i < path.length - 1; i++) {
    const a = out[out.length - 1]!;
    const b = path[i]!;
    const c = path[i + 1]!;
    const d1 = Math.sign(b.col - a.col) + Math.sign(b.row - a.row);
    const d2 = Math.sign(c.col - b.col) + Math.sign(c.row - b.row);
    if (d1 !== d2) out.push(b);
  }
  out.push(path[path.length - 1]!);
  return out;
}
