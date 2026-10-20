/**
 * Entry point: wires the simulation, the renderer and the interface together.
 */

import { World } from "./core/world.ts";
import { Renderer } from "./render/renderer.ts";
import { UI } from "./ui/ui.ts";
import type { BuildChoice, ToolId } from "./ui/ui.ts";
import { boothPrice, tileDef } from "./core/data.ts";
import { loadGame, saveGame } from "./core/save.ts";
import { art } from "./render/sprites.ts";
import "./ui/ui.css";

const app = document.getElementById("app")!;

/** The slot the game autosaves into. */
const AUTOSAVE_SLOT = "autosave";

let world = new World({ tier: 0, startingMoney: 20000 });

// ------------------------------------------------------------ interface ---

const ui = new UI(app, {
  onChoice: (choice) => {
    selection = choice;
  },
  onTool: (tool) => {
    tool = tool;
    renderer.setCursor(tool === "inspect" ? "default" : "crosshair");
  },
  onUpgrade: (boothId) => {
    const b = world.booths.find((x) => x.id === boothId);
    if (!b) return;
    if (world.upgradeBooth(b)) {
      ui.pushLog(world.log.splice(0, world.log.length));
    }
  },
  onDemolish: (boothId) => {
    const b = world.booths.find((x) => x.id === boothId);
    if (!b) return;
    world.removeBooth(b);
    renderer.markDirty();
  },
  onSpeed: (speed) => {
    world.speed = speed;
  },
  onSound: () => {
    // Audio is not wired up yet.
  },
  onLoad: (id) => {
    const loaded = loadGame(id);
    if (!loaded) {
      ui.pushLog(["That save could not be read."]);
      return;
    }
    world = loaded;
    renderer.markDirty();
    renderer.fitMap(world);
    ui.update(world);
  },
});

let tool: ToolId = "inspect";
let selection: BuildChoice | null = null;
let hover = { col: -1, row: -1 };
let dragging = false;
let dragStart = { x: 0, y: 0 };
let camStart = { x: 0, y: 0 };
let moved = false;
const keys = new Set<string>();

// -------------------------------------------------------------- canvas ----

const view = ui.canvas;
const renderer = new Renderer(view);

function localPoint(e: MouseEvent, canvas: HTMLCanvasElement): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function bindCanvas(canvas: HTMLCanvasElement): void {
  canvas.addEventListener("mousemove", (e) => {
    const p = localPoint(e, canvas);
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

  canvas.addEventListener("mousedown", (e) => {
    if (e.button !== 0) return;
    dragging = true;
    moved = false;
    const p = localPoint(e, canvas);
    dragStart = p;
    camStart = { x: renderer.camera.x, y: renderer.camera.y };
  });

  canvas.addEventListener("contextmenu", (e) => {
    e.preventDefault();
    ui.setTool("inspect");
  });

  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const p = localPoint(e, canvas);
      const before = renderer.screenToWorld(p.x, p.y);
      const factor = e.deltaY < 0 ? 1.12 : 1 / 1.12;
      renderer.camera.zoom = Math.max(0.3, Math.min(4, renderer.camera.zoom * factor));
      const after = renderer.screenToWorld(p.x, p.y);
      renderer.camera.x += before.x - after.x;
      renderer.camera.y += before.y - after.y;
    },
    { passive: false },
  );
}

window.addEventListener("mouseup", (e) => {
  if (!dragging) return;
  dragging = false;
  if (moved || e.button !== 0) return;
  const canvas = document.querySelector("canvas.view") as HTMLCanvasElement;
  const p = localPoint(e, canvas);
  handleClick(p.x, p.y);
});

window.addEventListener("keydown", (e) => {
  const tag = (e.target as HTMLElement)?.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA") return;
  keys.add(e.key.toLowerCase());
  if (e.key === "Escape") ui.setTool("inspect");
  if (e.code === "Space") {
    e.preventDefault();
    world.speed = world.speed === 0 ? 1 : 0;
    return;
  }
  // Number keys pick the tools in rail order.
  const n = Number(e.key);
  if (Number.isInteger(n) && n >= 1 && n <= 6) {
    ui.selectToolByIndex(n - 1);
  }
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

// ---------------------------------------------------------------- input ---

function handleClick(px: number, py: number): void {
  const g = renderer.pickTile(px, py);
  const tile = world.tileAt(g.col, g.row);

  if (tool === "demolish") {
    if (!tile) return;
    if (tile.booth) {
      const b = world.booths.find(
        (x) =>
          x.type === tile.booth &&
          x.col <= g.col &&
          x.row <= g.row &&
          g.col < x.col + x.cols &&
          g.row < x.row + x.rows,
      );
      if (b) {
        world.removeBooth(b);
        renderer.markDirty();
      }
      return;
    }
    if (tile.scenery) {
      world.removeScenery(g.col, g.row);
      renderer.markDirty();
    }
    return;
  }

  if (!selection) {
    // Inspect whatever is under the cursor.
    const b = tile?.booth
      ? world.booths.find(
          (x) =>
            x.type === tile.booth &&
            x.col <= g.col &&
            x.row <= g.row &&
            g.col < x.col + x.cols &&
            g.row < x.row + x.rows,
        )
      : null;
    ui.showFacility(b?.id ?? null);
    return;
  }

  if (selection.kind === "booth") {
    const placed = world.placeBooth(selection.id, g.col, g.row);
    if (placed) {
      renderer.markDirty();
      ui.pushLog(world.log.splice(0, world.log.length));
    }
  } else if (selection.kind === "scenery") {
    if (world.placeScenery(selection.id, g.col, g.row)) {
      renderer.markDirty();
    }
  } else if (selection.kind === "tile") {
    if (world.placeTile(selection.id, g.col, g.row)) {
      renderer.markDirty();
    }
  }
}

// ----------------------------------------------------------- main loop ----

let last = performance.now();
let sinceAutosave = 0;
function frame(now: number): void {
  const rawDt = (now - last) / 1000;
  // The simulation step is capped so a long stall does not teleport guests.
  const dt = Math.min(0.1, rawDt);
  last = now;

  // Keyboard panning.
  const panSpeed = (420 / renderer.camera.zoom) * dt;
  if (keys.has("w") || keys.has("arrowup")) renderer.camera.y -= panSpeed;
  if (keys.has("s") || keys.has("arrowdown")) renderer.camera.y += panSpeed;
  if (keys.has("a") || keys.has("arrowleft")) renderer.camera.x -= panSpeed;
  if (keys.has("d") || keys.has("arrowright")) renderer.camera.x += panSpeed;

  world.update(dt);
  ui.update(world);
  if (world.log.length) ui.pushLog(world.log.splice(0, world.log.length));

  // Autosave every twenty seconds of real time.
  sinceAutosave += rawDt;
  if (sinceAutosave > 20) {
    sinceAutosave = 0;
    saveGame(world, "Autosave", AUTOSAVE_SLOT);
  }

  const highlight =
    selection && hover.col >= 0
      ? {
          col: hover.col,
          row: hover.row,
          valid:
            selection.kind === "booth"
              ? world.canPlaceBooth(selection.id, hover.col, hover.row)
              : selection.kind === "scenery"
                ? world.canPlaceScenery(selection.id, hover.col, hover.row)
                : world.canPlaceTile(selection.id, hover.col, hover.row),
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
ui.setTool("inspect");
bindCanvas(view);
resize();
renderer.fitMap(world);
requestAnimationFrame(frame);

// Restore the last autosave, if there is one.
const autosave = loadGame(AUTOSAVE_SLOT);
if (autosave) {
  world = autosave;
  renderer.markDirty();
  renderer.fitMap(world);
  ui.update(world);
  ui.pushLog([`Restored your last resort (day ${world.day}).`]);
} else {
  ui.update(world);
}

// The artwork is optional: if it is missing the renderer falls back to
// procedural shapes, so the game still runs.
void art.load(() => {
  renderer.markDirty();
});

// Expose for debugging in the browser console.
(window as unknown as { game: unknown }).game = {
  get world() {
    return world;
  },
  renderer,
  ui,
  art,
  boothPrice,
  tileDef,
};
