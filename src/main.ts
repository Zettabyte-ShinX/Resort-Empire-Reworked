/**
 * Entry point: wires the simulation, the renderer and the HUD together.
 */

import { World } from "./core/world.ts";
import { Renderer } from "./render/renderer.ts";
import { Hud } from "./ui/hud.ts";
import type { BuildKind } from "./ui/hud.ts";
import { art } from "./render/sprites.ts";
import "./style.css";

const app = document.getElementById("app")!;

const view = document.createElement("canvas");
const world = new World({ tier: 0, startingMoney: 20000 });
const renderer = new Renderer(view);

const hud = new Hud(app, view, {
  onSelect: (sel) => {
    selection = sel;
  },
  onUpgrade: (boothId) => {
    const b = world.booths.find((x) => x.id === boothId);
    if (!b) return;
    if (world.upgradeBooth(b)) hud.showInspector(world, boothId);
  },
  onDemolish: (boothId) => {
    const b = world.booths.find((x) => x.id === boothId);
    if (!b) return;
    world.removeBooth(b);
    hud.showInspector(world, null);
  },
});

// ------------------------------------------------------------- input ------

let selection: BuildKind | null = null;
let hover = { col: -1, row: -1 };
let dragging = false;
let dragStart = { x: 0, y: 0 };
let camStart = { x: 0, y: 0 };
let moved = false;
const keys = new Set<string>();

function localPoint(e: MouseEvent): { x: number; y: number } {
  const rect = view.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

view.addEventListener("mousemove", (e) => {
  const p = localPoint(e);
  if (dragging) {
    const dx = (p.x - dragStart.x) / renderer.camera.zoom;
    const dy = (p.y - dragStart.y) / renderer.camera.zoom;
    renderer.camera.x = camStart.x - dx;
    renderer.camera.y = camStart.y - dy;
    if (Math.abs(p.x - dragStart.x) > 3 || Math.abs(p.y - dragStart.y) > 3) {
      moved = true;
    }
  } else {
    hover = renderer.pickTile(p.x, p.y);
  }
});

view.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;
  dragging = true;
  moved = false;
  const p = localPoint(e);
  dragStart = p;
  camStart = { x: renderer.camera.x, y: renderer.camera.y };
});

window.addEventListener("mouseup", (e) => {
  if (!dragging) return;
  dragging = false;
  if (moved || e.button !== 0) return;
  const p = localPoint(e);
  handleClick(p.x, p.y);
});

view.addEventListener("contextmenu", (e) => {
  e.preventDefault();
  hud.clearSelection();
});

view.addEventListener(
  "wheel",
  (e) => {
    e.preventDefault();
    const p = localPoint(e);
    const before = renderer.screenToWorld(p.x, p.y);
    const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
    renderer.camera.zoom = Math.max(0.75, Math.min(4, renderer.camera.zoom * factor));
    const after = renderer.screenToWorld(p.x, p.y);
    renderer.camera.x += before.x - after.x;
    renderer.camera.y += before.y - after.y;
  },
  { passive: false },
);

window.addEventListener("keydown", (e) => {
  keys.add(e.key.toLowerCase());
  if (e.key === "Escape") hud.clearSelection();
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

function handleClick(px: number, py: number): void {
  const g = renderer.pickTile(px, py);

  if (!selection) {
    // Inspect whatever facility is under the cursor.
    const t = world.tileAt(g.col, g.row);
    const booth = t?.booth
      ? world.booths.find(
          (b) =>
            b.type === t.booth &&
            b.col <= g.col &&
            b.row <= g.row &&
            g.col < b.col + b.cols &&
            g.row < b.row + b.rows,
        )
      : null;
    hud.showInspector(world, booth?.id ?? null);
    return;
  }

  if (selection.kind === "booth") {
    const placed = world.placeBooth(selection.id, g.col, g.row);
    if (placed) {
      renderer.markDirty();
      hud.showInspector(world, placed.id);
    }
  } else if (world.placeScenery(selection.id, g.col, g.row)) {
    renderer.markDirty();
  }
}

// ----------------------------------------------------------- main loop ----

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;

  // Keyboard panning.
  const panSpeed = (420 / renderer.camera.zoom) * dt;
  if (keys.has("w") || keys.has("arrowup")) renderer.camera.y -= panSpeed;
  if (keys.has("s") || keys.has("arrowdown")) renderer.camera.y += panSpeed;
  if (keys.has("a") || keys.has("arrowleft")) renderer.camera.x -= panSpeed;
  if (keys.has("d") || keys.has("arrowright")) renderer.camera.x += panSpeed;

  world.update(dt);
  hud.update(world);
  if (world.log.length) hud.pushLog(world.log.splice(0, world.log.length));

  const highlight =
    selection && hover.col >= 0
      ? {
          col: hover.col,
          row: hover.row,
          valid:
            selection.kind === "booth"
              ? world.canPlaceBooth(selection.id, hover.col, hover.row)
              : world.canPlaceScenery(selection.id, hover.col, hover.row),
        }
      : undefined;

  renderer.render(world, highlight);
  requestAnimationFrame(frame);
}

function resize(): void {
  renderer.resize();
}
window.addEventListener("resize", resize);

// Kick off.
resize();
renderer.fitMap(world);
hud.showInspector(world, null);
requestAnimationFrame(frame);

// The artwork is optional: if it is missing the renderer falls back to
// procedural shapes, so the game still runs.
void art.load(() => {
  renderer.markDirty();
});

// Expose for debugging in the browser console.
(window as unknown as { game: unknown }).game = { world, renderer, hud };
