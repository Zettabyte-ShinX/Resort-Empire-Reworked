/**
 * The game's user interface.
 *
 * Layout:
 *
 *   +-----------------------------------------------------------+
 *   |  top bar: money, clock, guests, popularity, research, speed |
 *   +----+---------------------------------------------+---------+
 *   |tool|                                             | sidebar |
 *   |rail|              canvas                        |  tabs   |
 *   |    |                                             |         |
 *   +----+---------------------------------------------+---------+
 *
 * The build palette slides out of the tool rail when a build tool is
 * selected, the way modern city builders do it.
 */

import {
  DATA,
  EXTRAS,
  EXTRA_LIST,
  boothDef,
  boothPopularity,
  boothPrice,
  guestDef,
  sceneryDef,
  tileDef,
  unlockLevel,
} from "../core/data.ts";
import type { BoothDef, SceneryDef, TileDef } from "../core/data.ts";
import type { World } from "../core/world.ts";
import { SPEEDS } from "../core/world.ts";
import { formatHour } from "../core/world.ts";
import { deleteSave, listSaves, saveGame } from "../core/save.ts";
import { icons } from "./icons.ts";
import type { IconName } from "./icons.ts";

export type ToolId =
  | "inspect"
  | "facility"
  | "room"
  | "scenery"
  | "path"
  | "demolish";

export type SideTab = "guests" | "facilities" | "rooms" | "staff" | "extras" | "stats";
export type DialogId =
  | "finance"
  | "achievements"
  | "options"
  | "guide"
  | "saves"
  | null;

/** A thing the player can place on the map. */
export type BuildChoice =
  | { kind: "booth"; id: string }
  | { kind: "scenery"; id: string }
  | { kind: "tile"; id: string };

export interface UICallbacks {
  onChoice: (choice: BuildChoice | null) => void;
  onTool: (tool: ToolId) => void;
  onUpgrade: (boothId: number) => void;
  onDemolish: (boothId: number) => void;
  onSpeed: (speed: number) => void;
  onSound: (muted: boolean) => void;
  onMusic: (on: boolean) => void;
  onBuyExtra: (id: string) => void;
  onLoad: (id: string) => void;
}

interface ToolDef {
  id: ToolId;
  icon: IconName;
  label: string;
  hint: string;
}

const TOOLS: ToolDef[] = [
  { id: "inspect", icon: "inspect", label: "Inspect", hint: "Inspect - select a facility to see its details" },
  { id: "facility", icon: "build", label: "Facilities", hint: "Facilities - build a facility" },
  { id: "room", icon: "room", label: "Rooms", hint: "Rooms - build a guest room" },
  { id: "scenery", icon: "scenery", label: "Scenery", hint: "Scenery - plant trees and shrubs" },
  { id: "path", icon: "path", label: "Paths", hint: "Paths - lay paths for guests to walk on" },
  { id: "demolish", icon: "demolish", label: "Demolish", hint: "Demolish - remove a facility or plant" },
];

/** Keyboard shortcut for each tool, in rail order. */
const TOOL_KEYS = ["1", "2", "3", "4", "5", "6"];

const SIDE_TABS: { id: SideTab; label: string; icon: IconName }[] = [
  { id: "guests", label: "Guests", icon: "guest" },
  { id: "facilities", label: "Facilities", icon: "build" },
  { id: "rooms", label: "Rooms", icon: "bed" },
  { id: "staff", label: "Staff", icon: "users" },
  { id: "extras", label: "Extras", icon: "flask" },
  { id: "stats", label: "Reports", icon: "chart" },
];

const money = (n: number): string =>
  `$${Math.round(n).toLocaleString("en-US")}`;

const compact = (n: number): string =>
  Math.abs(n) >= 1_000_000
    ? `${(n / 1_000_000).toFixed(1)}M`
    : Math.abs(n) >= 10_000
      ? `${(n / 1000).toFixed(1)}k`
      : Math.round(n).toLocaleString("en-US");

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  html?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (html !== undefined) node.innerHTML = html;
  return node;
}

export class UI {
  private root: HTMLElement;
  private cb: UICallbacks;

  private tool: ToolId = "inspect";
  private tab: SideTab = "guests";
  private choice: BuildChoice | null = null;
  private muted = false;
  private musicOn = true;
  private search = "";

  // Cached nodes
  private statsEl!: HTMLElement;
  private railEl!: HTMLElement;
  private paletteEl!: HTMLElement;
  private paletteTitle!: HTMLElement;
  private sideTabsEl!: HTMLElement;
  private sideBodyEl!: HTMLElement;
  private logEl!: HTMLElement;
  private modalEl!: HTMLElement;
  private loaderEl: HTMLElement | null = null;
  private speedEl!: HTMLElement;

  constructor(root: HTMLElement, cb: UICallbacks) {
    this.root = root;
    this.cb = cb;
    this.build();
  }


  get canvas(): HTMLCanvasElement {
    return this.root.querySelector("canvas.view")!;
  }

  // ------------------------------------------------------------- layout ---

  private build(): void {
    this.root.innerHTML = "";
    this.root.className = "ui";

    // ---- top bar ----
    const top = el("header", "topbar");
    top.innerHTML = `
      <div class="brand">
        <span class="brand-mark"></span>
        <span class="brand-name">Resort Empire</span>
        <span class="brand-tag">Reworked</span>
      </div>
      <div class="pills" id="pills"></div>
      <div class="top-actions">
        <div class="speed" id="speed"></div>
        <button class="icon-btn" data-act="sound" title="Toggle sound">${icons.sound}</button>
        <button class="icon-btn" data-act="menu" title="Menu">${icons.menu}</button>
      </div>`;
    this.root.appendChild(top);
    this.statsEl = top.querySelector("#pills")!;
    this.speedEl = top.querySelector("#speed")!;

    // ---- body ----
    const body = el("div", "ui-body");

    const rail = el("nav", "rail");
    this.railEl = el("div", "rail-tools");
    rail.appendChild(this.railEl);
    this.paletteEl = el("div", "palette");
    this.paletteTitle = el("div", "palette-title");
    this.paletteEl.appendChild(this.paletteTitle);
    this.paletteEl.appendChild(el("div", "palette-list"));
    rail.appendChild(this.paletteEl);

    const stage = el("main", "stage");
    const canvas = el("canvas", "view");
    stage.appendChild(canvas);
    this.logEl = el("div", "log");
    stage.appendChild(this.logEl);

    const side = el("aside", "side");
    this.sideTabsEl = el("div", "side-tabs");
    this.sideBodyEl = el("div", "side-body");
    side.appendChild(this.sideTabsEl);
    side.appendChild(this.sideBodyEl);

    body.append(rail, stage, side);
    this.root.appendChild(body);

    this.modalEl = el("div", "modal-layer");
    this.root.appendChild(this.modalEl);

    // ---- loading overlay ----
    // The original's artwork is a couple of thousand images, so the game
    // says how far along it is rather than showing an empty resort.
    this.loaderEl = el("div", "loader");
    this.loaderEl.innerHTML = `
      <div class="loader-card">
        <div class="loader-title">Resort Empire</div>
        <div class="loader-note">Unpacking the original's artwork</div>
        <div class="loader-bar"><div class="loader-fill"></div></div>
      </div>`;
    this.root.appendChild(this.loaderEl);

    this.buildRail();
    this.buildSideTabs();
    this.buildSpeed();
    this.wireTopActions();
  }

  /** Show how much of the original's artwork has been loaded. */
  setLoading(loaded: number, total: number): void {
    if (!this.loaderEl) return;
    if (loaded >= total) {
      this.loaderEl.classList.add("done");
      window.setTimeout(() => {
        this.loaderEl?.remove();
        this.loaderEl = null;
      }, 400);
      return;
    }
    const fill = this.loaderEl.querySelector<HTMLElement>(".loader-fill");
    if (fill) fill.style.width = `${Math.round((loaded / total) * 100)}%`;
  }

  private buildRail(): void {
    this.railEl.innerHTML = "";
    TOOLS.forEach((t, i) => {
      const b = el("button", "rail-btn");
      b.dataset.tool = t.id;
      b.innerHTML = icons[t.icon];
      b.setAttribute("aria-label", t.label);
      b.dataset.tip = t.hint;
      b.addEventListener("click", () => this.setTool(t.id));
      this.railEl.appendChild(b);
      // The shortcut is shown as a small badge in the corner.
      const key = el("span", "rail-key", TOOL_KEYS[i] ?? "");
      b.appendChild(key);
    });
  }

  private buildSideTabs(): void {
    this.sideTabsEl.innerHTML = "";
    for (const t of SIDE_TABS) {
      const b = el("button", "side-tab");
      b.dataset.tab = t.id;
      b.innerHTML = `${icons[t.icon]}<span>${t.label}</span>`;
      b.addEventListener("click", () => {
        this.tab = t.id;
        this.renderSide();
      });
      this.sideTabsEl.appendChild(b);
    }
  }

  private buildSpeed(): void {
    this.speedEl.innerHTML = "";
    for (const s of SPEEDS) {
      const b = el("button", "speed-btn");
      b.dataset.speed = String(s);
      b.innerHTML = s === 0 ? icons.pause : s === 1 ? icons.play : icons.fast;
      b.title = s === 0 ? "Pause (Space)" : s === 1 ? "Normal speed" : `${s}x speed`;
      b.addEventListener("click", () => this.cb.onSpeed(s));
      this.speedEl.appendChild(b);
    }
  }

  private wireTopActions(): void {
    this.root.querySelectorAll<HTMLElement>("[data-act]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const act = btn.dataset.act;
        if (act === "sound") {
          this.muted = !this.muted;
          btn.innerHTML = this.muted ? icons.mute : icons.sound;
          btn.classList.toggle("is-off", this.muted);
          this.cb.onSound(this.muted);
        } else if (act === "menu") {
          this.openDialog("options");
        }
      });
    });
  }

  // -------------------------------------------------------------- tools ---

  setTool(tool: ToolId): void {
    this.tool = tool;
    this.choice = null;
    this.cb.onChoice(null);
    this.cb.onTool(tool);
    for (const b of this.railEl.querySelectorAll<HTMLElement>(".rail-btn")) {
      b.classList.toggle("is-active", b.dataset.tool === tool);
    }
    this.root.classList.toggle("palette-open", tool !== "inspect" && tool !== "demolish");
    this.renderPalette();
  }

  private renderPalette(): void {
    const list = this.paletteEl.querySelector(".palette-list")!;
    list.innerHTML = "";
    const tool = this.tool;

    if (tool === "demolish") {
      this.paletteTitle.textContent = "Demolish";
      list.innerHTML = `<p class="palette-hint">Click a facility or a plant to remove it. Facilities are refunded at half price.</p>`;
      return;
    }
    if (tool === "inspect") {
      this.paletteTitle.textContent = "Inspect";
      list.innerHTML = `<p class="palette-hint">Click a facility to open its panel.</p>`;
      return;
    }

    // A search field keeps long lists usable.
    const search = el("input", "palette-search");
    search.placeholder = "Search...";
    search.value = this.search;
    search.addEventListener("input", () => {
      this.search = search.value;
      this.renderPaletteList();
    });
    list.appendChild(search);

    const titles: Record<string, string> = {
      facility: "Facilities",
      room: "Rooms",
      scenery: "Scenery",
      path: "Paths",
    };
    this.paletteTitle.textContent = titles[tool] ?? "";
    this.renderPaletteList();
  }

  private renderPaletteList(): void {
    const list = this.paletteEl.querySelector(".palette-list")!;
    const search = list.querySelector(".palette-search");
    list.innerHTML = "";
    if (search) list.appendChild(search);

    const q = this.search.trim().toLowerCase();
    const entries = this.paletteEntries();

    for (const e of entries) {
      if (q && !e.label.toLowerCase().includes(q)) continue;
      const b = el("button", "palette-item");
      b.classList.toggle("is-active", this.sameChoice(this.choice, e.choice));
      b.classList.toggle("is-locked", !!e.locked);
      b.innerHTML = `
        <span class="pi-name">${e.label}</span>
        <span class="pi-meta">${e.meta}</span>
        <span class="pi-price">${e.price}</span>`;
      if (e.locked) {
        b.disabled = true;
        b.title = "More research is needed before this can be built.";
      } else {
        b.addEventListener("click", () => {
          this.choice = this.sameChoice(this.choice, e.choice) ? null : e.choice;
          this.cb.onChoice(this.choice);
          this.renderPaletteList();
        });
      }
      list.appendChild(b);
    }

    if (!list.querySelector(".palette-item")) {
      list.appendChild(el("p", "palette-hint", "Nothing matches that search."));
    }
  }

  /** Switch tool by its number key. Returns true if a tool was selected. */
  selectToolByIndex(index: number): boolean {
    const tool = TOOLS[index];
    if (!tool) return false;
    this.setTool(tool.id);
    return true;
  }

  private sameChoice(a: BuildChoice | null, b: BuildChoice): boolean {
    return !!a && a.kind === b.kind && a.id === b.id;
  }

  private paletteEntries(): {
    label: string;
    meta: string;
    price: string;
    choice: BuildChoice;
    locked?: boolean;
  }[] {
    const out: {
      label: string;
      meta: string;
      price: string;
      choice: BuildChoice;
      locked?: boolean;
    }[] = [];

    if (this.tool === "facility" || this.tool === "room") {
      const wantRoom = this.tool === "room";
      // `DATA.listing` is the order the original unlocked facilities in, so
      // the palette matches how the game is meant to be played.
      const order = [...DATA.listing];
      for (const id of Object.keys(DATA.booths)) {
        if (id === "boostMood") continue;
        if (!order.includes(id)) order.push(id);
      }
      for (const id of order) {
        const def = DATA.booths[id];
        if (!def) continue;
        const isRoom = def.mainJenis === "Room";
        if (isRoom !== wantRoom) continue;
        // The original unlocks facilities as the resort researches them.
        const need = unlockLevel(id);
        const level = this.world?.researchLevel ?? 0;
        const locked = need !== null && level < need;
        out.push({
          label: def.nic || def.nama,
          meta: locked
            ? `research ${need}`
            : `${def.COLS}x${def.ROWS}`,
          price: locked ? "locked" : money(boothPrice(id, 0)),
          choice: { kind: "booth", id },
          locked,
        });
      }
    } else if (this.tool === "scenery") {
      for (const id of DATA.sceneryListing) {
        const def = sceneryDef(id);
        out.push({
          label: def.nama,
          meta: `+${(def.pop * 100).toFixed(0)}% pop`,
          price: money(def.price),
          choice: { kind: "scenery", id },
        });
      }
    } else if (this.tool === "path") {
      for (const id of ["TILE_1", "TILE_2", "TILE_3", "TILE_4"]) {
        const def = tileDef(id);
        out.push({
          label: def.nama,
          meta: "walkable",
          price: money(def.price),
          choice: { kind: "tile", id },
        });
      }
    }
    return out;
  }

  // ------------------------------------------------------------ sidebar ---

  private renderSide(): void {
    for (const b of this.sideTabsEl.querySelectorAll<HTMLElement>(".side-tab")) {
      b.classList.toggle("is-active", b.dataset.tab === this.tab);
    }
    const body = this.sideBodyEl;
    body.innerHTML = "";
    body.scrollTop = 0;

    switch (this.tab) {
      case "guests":
        this.renderGuests(body);
        break;
      case "facilities":
        this.renderFacilities(body, false);
        break;
      case "rooms":
        this.renderFacilities(body, true);
        break;
      case "staff":
        this.renderStaff(body);
        break;
      case "extras":
        this.renderExtras(body);
        break;
      case "stats":
        this.renderStats(body);
        break;
    }
  }

  private renderGuests(body: HTMLElement): void {
    const world = this.world!;
    if (world.visitors.length === 0) {
      body.appendChild(
        el("p", "empty", "No guests yet. Build somewhere for people to stay and they will start arriving."),
      );
      return;
    }
    for (const v of [...world.visitors].sort((a, b) => a.mood - b.mood)) {
      const row = el("div", "guest-row");
      const moodClass = v.mood >= 70 ? "good" : v.mood >= 45 ? "ok" : "bad";
      row.innerHTML = `
        <div class="g-top">
          <span class="g-name">${guestName(v)}</span>
          <span class="g-mood ${moodClass}">${Math.round(v.mood)}%</span>
        </div>
        <div class="bar"><i class="${moodClass}" style="width:${Math.max(2, v.mood)}%"></i></div>
        <div class="g-meta">
          <span>${activityLabel(v.state)}</span>
          <span>${money(v.spent)} spent</span>
        </div>`;
      body.appendChild(row);
    }
  }

  private renderFacilities(body: HTMLElement, roomsOnly: boolean): void {
    const world = this.world!;
    const list = world.booths.filter((b) => {
      const def = boothDef(b.type);
      return roomsOnly ? def.mainJenis === "Room" : def.mainJenis !== "Room";
    });

    if (list.length === 0) {
      body.appendChild(
        el(
          "p",
          "empty",
          roomsOnly
            ? "No rooms built yet. Rooms are where guests actually stay."
            : "No facilities built yet. Use the build tools on the left.",
        ),
      );
      return;
    }

    for (const b of list) {
      const def = boothDef(b.type);
      const row = el("div", "fac-row");
      const price = boothPrice(b.type, b.level + 1);
      const canUpgrade = b.level < 2;
      row.innerHTML = `
        <div class="f-head">
          <span class="f-name">${def.nic || def.nama}</span>
          <span class="f-level">Lv ${b.level + 1}</span>
        </div>
        <div class="f-meta">
          <span>${b.served} served</span>
          <span>${b.occupancy} inside</span>
        </div>
        <div class="bar"><i class="${b.satisfaction >= 70 ? "good" : b.satisfaction >= 45 ? "ok" : "bad"}" style="width:${Math.max(2, b.satisfaction)}%"></i></div>
        <div class="f-actions">
          <button data-up="${b.id}" ${canUpgrade ? "" : "disabled"}>${canUpgrade ? `Upgrade ${money(price)}` : "Max level"}</button>
          <button data-del="${b.id}" class="ghost">Demolish</button>
        </div>`;
      body.appendChild(row);
    }

    body.querySelectorAll<HTMLElement>("[data-up]").forEach((btn) => {
      btn.addEventListener("click", () =>
        this.cb.onUpgrade(Number(btn.dataset.up)),
      );
    });
    body.querySelectorAll<HTMLElement>("[data-del]").forEach((btn) => {
      btn.addEventListener("click", () =>
        this.cb.onDemolish(Number(btn.dataset.del)),
      );
    });
  }

  private renderExtras(body: HTMLElement): void {
    const world = this.world!;
    const level = world.researchLevel;
    let bought = 0;
    for (const id of EXTRA_LIST) {
      const def = EXTRAS[id];
      if (!def) continue;
      const owned = world.hasExtra(id);
      if (owned) bought++;
      const hasFacility = world.booths.some((b) => b.type === def.unlocked);
      const row = el("div", "fac-row");
      const note = owned
        ? "Bought"
        : level < def.need_star
          ? `Research level ${def.need_star}`
          : !hasFacility
            ? `Needs a ${def.unlocked.toLowerCase()}`
            : world.money >= def.price
              ? "Ready to buy"
              : "Not enough money";
      row.innerHTML = `
        <div class="f-head">
          <span class="f-name">${def.name}</span>
          <span class="f-level">${note}</span>
        </div>
        <div class="f-meta">
          <span>${def.effect}</span>
          <span>${owned ? "" : money(def.price)}</span>
        </div>`;
      if (!owned && world.canBuyExtra(id)) {
        const buy = el("button", "primary small", "Buy");
        buy.addEventListener("click", () => {
          this.cb.onBuyExtra(id);
          this.renderSide();
        });
        row.appendChild(buy);
      }
      body.appendChild(row);
    }
    body.appendChild(
      el("p", "empty", `${bought} of ${EXTRA_LIST.length} bought. Research level ${level}.`),
    );
  }

  private renderStaff(body: HTMLElement): void {
    const world = this.world!;
    const list = world.booths.filter((b) => boothDef(b.type).sumStaff > 0);
    if (list.length === 0) {
      body.appendChild(
        el("p", "empty", "No staff yet. Facilities like the bar, the medical centre and the shops need one."),
      );
      return;
    }

    let total = 0;
    for (const b of list) {
      const def = boothDef(b.type);
      const rate = def.salary[Math.min(b.level, def.salary.length - 1)] ?? 0;
      const wage = rate * def.sumStaff;
      total += wage;
      const row = el("div", "fac-row");
      row.innerHTML = `
        <div class="f-head">
          <span class="f-name">${def.nic || def.nama}</span>
          <span class="f-level">${def.sumStaff} staff</span>
        </div>
        <div class="f-meta">
          <span>${money(rate)} each a day</span>
          <span>${money(wage)} a day</span>
        </div>`;
      body.appendChild(row);
    }

    body.appendChild(
      el(
        "p",
        "empty",
        `The staff of the resort costs ${money(total)} a day, which is paid at midnight.`,
      ),
    );
  }

  private renderStats(body: HTMLElement): void {
    const world = this.world!;
    const s = world.stats;
    const grid = el("div", "stat-grid");
    const rows: [string, string][] = [
      ["Guests arrived", compact(s.guestsArrived)],
      ["Guests served", compact(s.guestsServed)],
      ["Revenue", money(s.revenue)],
      ["Facilities built", compact(s.built)],
      ["Demolished", compact(s.demolished)],
      ["Popularity", world.popularity.toFixed(2)],
      ["Research points", compact(world.researchPoints)],
      ["Guests on site", `${world.visitors.length}`],
    ];
    for (const [k, v] of rows) {
      grid.appendChild(
        el("div", "stat-cell", `<span class="k">${k}</span><span class="v">${v}</span>`),
      );
    }
    body.appendChild(grid);

    // Revenue by hour of the day.
    const hist = world.hourlyRevenue;
    const max = Math.max(1, ...hist);
    const chart = el("div", "chart");
    chart.innerHTML = `<div class="chart-title">Revenue by hour</div>`;
    const bars = el("div", "chart-bars");
    for (let h = 0; h < 24; h++) {
      const b = el("div", "chart-bar");
      const pct = Math.round((hist[h] ?? 0) / max * 100);
      b.style.height = `${Math.max(2, pct)}%`;
      b.dataset.tip = `${h}:00 - ${money(hist[h] ?? 0)}`;
      bars.appendChild(b);
    }
    chart.appendChild(bars);
    body.appendChild(chart);
  }

  // ---------------------------------------------------------- inspector ---

  /**
   * Show a facility's details. Called when the player inspects a building.
   */
  showFacility(boothId: number | null): void {
    if (boothId === null) {
      this.modalEl.innerHTML = "";
      this.modalEl.classList.remove("is-open");
      return;
    }
    const world = this.world;
    const booth = world?.booths.find((b) => b.id === boothId);
    if (!world || !booth) return;

    const def = boothDef(booth.type);
    this.modalEl.innerHTML = "";
    this.modalEl.classList.add("is-open");

    const backdrop = el("div", "modal-backdrop");
    backdrop.addEventListener("click", () => this.showFacility(null));
    this.modalEl.appendChild(backdrop);

    const box = el("div", "modal");
    const head = el("div", "modal-head");
    head.innerHTML = `<h2>${def.nama}</h2>`;
    const close = el("button", "icon-btn", icons.close);
    close.addEventListener("click", () => this.showFacility(null));
    head.appendChild(close);
    box.appendChild(head);

    const body = el("div", "modal-body");
    const grid = el("div", "stat-grid");
    const expMax = def.Exp?.[booth.level + 1] ?? 0;
    const rows: [string, string][] = [
      ["Level", `${booth.level + 1} of 3`],
      ["Guests served", `${booth.served}`],
      ["Inside now", `${booth.occupancy}`],
      ["Satisfaction", `${Math.round(booth.satisfaction)}%`],
      ["Popularity", boothPop(booth.type, booth.level).toFixed(2)],
      ["Nightly rate", money(nightlyRate(booth.type, booth.level))],
    ];
    if (expMax > 0) {
      rows.push([
        "Experience",
        `${booth.exp} of ${expMax} to the next level`,
      ]);
    }
    if (def.sumStaff) {
      rows.push([
        "Staff",
        `${def.sumStaff} at ${money(
          (def.salary[Math.min(booth.level, def.salary.length - 1)] ?? 0) * def.sumStaff,
        )} a day`,
      ]);
    }
    const open = def.opened || def.closed;
    if (open) {
      rows.push(["Open", `${def.opened}:00 to ${def.closed}:00`]);
    }
    for (const [k, v] of rows) {
      grid.appendChild(
        el("div", "stat-cell", `<span class="k">${k}</span><span class="v">${v}</span>`),
      );
    }
    body.appendChild(grid);

    if (def.desc?.length) {
      // The original's descriptions use "n" for a line break and leave the
      // first line empty for some facilities.
      const text = def.desc
        .map((line) => line.replace(/^n/, "").trim())
        .filter(Boolean)
        .join(" ");
      if (text) body.appendChild(el("p", "empty", text));
    }

    const actions = el("div", "f-actions");
    const canUpgrade = booth.level < 2;
    const price = boothPrice(booth.type, booth.level + 1);
    const up = el("button", canUpgrade ? "" : "ghost");
    if (!canUpgrade) {
      up.textContent = "Already at the highest level";
    } else if (expMax > 0 && booth.exp < expMax) {
      // The original only upgrades a facility once it has enough experience.
      up.textContent = `Needs ${expMax - booth.exp} more experience`;
    } else {
      up.textContent = `Upgrade - ${money(price)}`;
    }
    up.disabled = !canUpgrade || (expMax > 0 && booth.exp < expMax);
    up.addEventListener("click", () => {
      this.cb.onUpgrade(booth.id);
      this.showFacility(booth.id);
    });
    const del = el("button", "ghost danger", "Demolish");
    del.addEventListener("click", () => {
      this.cb.onDemolish(booth.id);
      this.showFacility(null);
    });
    actions.append(up, del);
    body.appendChild(actions);

    box.appendChild(body);
    this.modalEl.appendChild(box);
  }

  // ------------------------------------------------------------ dialogs ---

  openDialog(id: DialogId): void {
    this.modalEl.innerHTML = "";
    this.modalEl.classList.toggle("is-open", id !== null);
    if (!id) return;

    const backdrop = el("div", "modal-backdrop");
    backdrop.addEventListener("click", () => this.openDialog(null));
    this.modalEl.appendChild(backdrop);

    const box = el("div", "modal");
    const head = el("div", "modal-head");
    head.innerHTML = `<h2>${this.dialogTitle(id)}</h2>`;
    const close = el("button", "icon-btn", icons.close);
    close.addEventListener("click", () => this.openDialog(null));
    head.appendChild(close);
    box.appendChild(head);
    const body = el("div", "modal-body");
    box.appendChild(body);
    this.modalEl.appendChild(box);

    switch (id) {
      case "finance":
        this.renderFinance(body);
        break;
      case "achievements":
        this.renderAchievements(body);
        break;
      case "options":
        this.renderOptions(body);
        break;
      case "guide":
        this.renderGuide(body);
        break;
      case "saves":
        this.renderSaves(body);
        break;
    }
  }

  private dialogTitle(id: DialogId): string {
    switch (id) {
      case "finance":
        return "Finances";
      case "achievements":
        return "Achievements";
      case "options":
        return "Options";
      case "guide":
        return "How to play";
      case "saves":
        return "Saves";
      default:
        return "";
    }
  }

  private renderFinance(body: HTMLElement): void {
    const world = this.world!;
    const s = world.stats;
    const grid = el("div", "stat-grid");
    for (const [k, v] of [
      ["Cash", money(world.money)],
      ["Revenue", money(s.revenue)],
      ["Staff wages", money(s.wages)],
      ["Net", money(s.revenue - s.wages)],
      ["Guests served", compact(s.guestsServed)],
      ["Guests arrived", compact(s.guestsArrived)],
    ] as [string, string][]) {
      grid.appendChild(
        el("div", "stat-cell", `<span class="k">${k}</span><span class="v">${v}</span>`),
      );
    }
    body.appendChild(grid);
    body.appendChild(
      el(
        "p",
        "empty",
        "Facilities earn money every time a guest uses them. Guests pay the facility's nightly rate.",
      ),
    );
  }

  private renderAchievements(body: HTMLElement): void {
    const world = this.world!;
    const list = el("div", "ach-list");
    const entries: [string, string, boolean][] = [
      ["First steps", "Build your first facility", world.stats.built >= 1],
      ["Grand opening", "Have 25 guests arrive", world.stats.guestsArrived >= 25],
      ["Well reviewed", "Serve 100 guests", world.stats.guestsServed >= 100],
      ["Profitable", "Earn $10,000 in revenue", world.stats.revenue >= 10000],
      ["A place to stay", "Build 5 facilities", world.stats.built >= 5],
      ["Popular resort", "Reach a popularity of 20", world.popularity >= 20],
    ];
    for (const [name, desc, done] of entries) {
      const row = el("div", `ach${done ? " is-done" : ""}`);
      row.innerHTML = `
        <span class="ach-mark">${done ? "✓" : ""}</span>
        <span class="ach-text"><b>${name}</b><i>${desc}</i></span>`;
      list.appendChild(row);
    }
    body.appendChild(list);
  }

  private renderOptions(body: HTMLElement): void {
    const world = this.world!;
    const rows = el("div", "opt-list");

    const speedRow = el("div", "opt-row");
    speedRow.innerHTML = `<span>Game speed</span>`;
    const speedSel = el("div", "seg");
    for (const s of SPEEDS) {
      const b = el("button", "seg-btn", s === 0 ? "Paused" : `${s}x`);
      if (world.speed === s) b.classList.add("is-active");
      b.addEventListener("click", () => {
        this.cb.onSpeed(s);
        this.openDialog("options");
      });
      speedSel.appendChild(b);
    }
    speedRow.appendChild(speedSel);
    rows.appendChild(speedRow);

    const soundRow = el("div", "opt-row");
    soundRow.innerHTML = `<span>Sound</span>`;
    const soundSel = el("div", "seg");
    for (const [label, muted] of [["On", false], ["Muted", true]] as [string, boolean][]) {
      const b = el("button", "seg-btn", label);
      if (this.muted === muted) b.classList.add("is-active");
      b.addEventListener("click", () => {
        this.muted = muted;
        this.cb.onSound(muted);
        this.openDialog("options");
      });
      soundSel.appendChild(b);
    }
    soundRow.appendChild(soundSel);
    rows.appendChild(soundRow);

    const musicRow = el("div", "opt-row");
    musicRow.innerHTML = `<span>Music</span>`;
    const musicSel = el("div", "seg");
    for (const [label, on] of [["On", true], ["Muted", false]] as [string, boolean][]) {
      const b = el("button", "seg-btn", label);
      if (this.musicOn === on) b.classList.add("is-active");
      b.addEventListener("click", () => {
        this.musicOn = on;
        this.cb.onMusic(on);
        this.openDialog("options");
      });
      musicSel.appendChild(b);
    }
    musicRow.appendChild(musicSel);
    rows.appendChild(musicRow);

    body.appendChild(rows);

    const links = el("div", "opt-links");
    for (const [id, label] of [
      ["guide", "How to play"],
      ["saves", "Saves"],
      ["achievements", "Achievements"],
      ["finance", "Finances"],
    ] as [DialogId, string][]) {
      const b = el("button", "opt-link", label);
      b.addEventListener("click", () => this.openDialog(id));
      links.appendChild(b);
    }
    body.appendChild(links);
  }

  private renderGuide(body: HTMLElement): void {
    body.innerHTML = `
      <ol class="guide">
        <li><b>Build something.</b> Use the tools on the left. Facilities earn money; rooms let guests stay overnight.</li>
        <li><b>Lay paths.</b> The plot of sand cannot be walked on. Guests reach a facility only if a path joins it to the gate, so lay paths from the gate to what you build.</li>
        <li><b>Give them a room.</b> A guest will not come into the resort until there is a cottage or a lodge for it, and it has to be connected by a path.</li>
        <li><b>Plant scenery.</b> Trees and shrubs raise the resort's popularity, which brings more guests.</li>
        <li><b>Watch the clock.</b> The resort opens at 6am and closes at 11pm. Guests leave when it closes, and each facility has its own opening hours.</li>
        <li><b>Upgrade and expand.</b> A facility needs experience from the guests it serves before it can be upgraded, and research unlocks new ones.</li>
      </ol>
      <p class="empty">Drag to pan, scroll to zoom, and use the arrow keys or WASD to move the camera. Press Esc to cancel the current tool.</p>`;
  }

  private renderSaves(body: HTMLElement): void {
    const world = this.world!;
    const nameRow = el("div", "save-new");
    const input = el("input", "save-name");
    input.placeholder = "Save name";
    input.value = `Resort day ${world.day}`;
    input.addEventListener("focus", () => input.select());
    const saveBtn = el("button", "primary", "Save");
    saveBtn.addEventListener("click", () => {
      saveGame(world, input.value.trim() || "Resort");
      this.openDialog("saves");
    });
    nameRow.append(input, saveBtn);
    body.appendChild(nameRow);

    const list = el("div", "save-list");
    const saves = listSaves();
    if (saves.length === 0) {
      list.appendChild(el("p", "empty", "No saved resorts yet."));
    }
    for (const s of saves) {
      const row = el("div", "save-row");
      row.innerHTML = `
        <span class="sv-name">${s.name}</span>
        <span class="sv-meta">Day ${s.day} - ${formatHour(s.hour)} - ${money(s.money)}</span>`;
      const load = el("button", "ghost", "Load");
      load.addEventListener("click", () => {
        this.cb.onLoad(s.id);
        this.openDialog(null);
      });
      const del = el("button", "ghost danger", "Delete");
      del.addEventListener("click", () => {
        deleteSave(s.id);
        this.openDialog("saves");
      });
      row.append(load, del);
      list.appendChild(row);
    }
    body.appendChild(list);
  }

  // -------------------------------------------------------------- update ---

  world: World | null = null;

  update(world: World): void {
    const first = this.world !== world;
    this.world = world;

    if (first) {
      this.renderSide();
      return;
    }

    // Top bar pills.
    const s = world.status();
    this.statsEl.innerHTML = `
      <div class="pill pill-money">${icons.money}<b>${money(s.money)}</b></div>
      <div class="pill">${icons.clock}<b>Day ${s.day}</b><span>${formatHour(s.hour)}</span></div>
      <div class="pill">${icons.users}<b>${s.guests}</b><span>/ ${s.capacity}</span></div>
      <div class="pill">${icons.star}<b>${s.popularity.toFixed(1)}</b><span>pop</span></div>
      <div class="pill">${icons.flask}<b>${Math.round(s.research)}</b><span>RP</span></div>
      <div class="pill">${icons.star}<b>${s.researchLevel}</b><span>level</span></div>`;

    for (const b of this.speedEl.querySelectorAll<HTMLElement>(".speed-btn")) {
      b.classList.toggle("is-active", Number(b.dataset.speed) === world.speed);
    }

    // The sidebar changes as the game does, so refresh it periodically.
    if (this.sideBodyEl.childElementCount > 0) this.renderSide();
  }

  pushLog(lines: string[]): void {
    for (const line of lines) {
      const div = el("div", "log-line", line);
      this.logEl.appendChild(div);
      setTimeout(() => div.classList.add("is-fading"), 4200);
      setTimeout(() => div.remove(), 7000);
    }
    while (this.logEl.childElementCount > 6) {
      this.logEl.firstElementChild?.remove();
    }
  }
}

function boothPop(type: string, level: number): number {
  return boothPopularity(type, level);
}

function nightlyRate(type: string, level: number): number {
  const def = boothDef(type);
  const p = def.booked_price;
  return Array.isArray(p) ? (p[Math.min(level, p.length - 1)] ?? 0) : p;
}

/** A guest's name, from the original's lists of names. */
function guestName(v: { variant: number; seed: number }): string {
  const def = guestDef(v.variant);
  const male = def.sex === 1;
  const first = (male ? DATA.visitor.FIRSTNAME_MALE : DATA.visitor.FIRSTNAME_FEMALE) as string[];
  const second = (male ? DATA.visitor.SECONDNAME_MALE : DATA.visitor.SECONDNAME_FEMALE) as string[];
  if (!first?.length || !second?.length) return "Guest";
  const a = first[Math.floor(v.seed * first.length) % first.length]!;
  const b = second[Math.floor(v.seed * 977) % second.length]!;
  return `${a} ${b}`;
}

function activityLabel(state: string): string {
  switch (state) {
    case "arriving":
      return "Arriving";
    case "seeking":
      return "Looking for something to do";
    case "walking":
      return "Walking";
    case "using":
      return "Enjoying a facility";
    case "leaving":
      return "Heading home";
    default:
      return "Here";
  }
}

export type { BoothDef, SceneryDef, TileDef };
