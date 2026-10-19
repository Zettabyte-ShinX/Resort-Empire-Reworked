/**
 * DOM heads-up display: status bar, build palette and event log.
 *
 * The UI is plain HTML so it stays crisp at any resolution and costs almost
 * nothing on low-end hardware - the canvas does the heavy lifting.
 */

import { DATA, boothDef, boothPrice, sceneryDef } from "../core/data.ts";
import type { World } from "../core/world.ts";
import { formatHour } from "../core/world.ts";

export type BuildKind = { kind: "booth"; id: string } | { kind: "scenery"; id: string };

export interface HudCallbacks {
  onSelect: (sel: BuildKind | null) => void;
  onUpgrade: (boothId: number) => void;
  onDemolish: (boothId: number) => void;
}

const FACILITY_ORDER = [
  "Lobby", "Cottage", "Lodge", "Pool", "Gym", "Spa", "Sauna", "Jacuzi",
  "Arcade", "Golf", "Icecream", "Hotdog", "Taco", "Bar",
  "IndiaResto", "JapanResto", "BaratResto",
  "Giftshop", "Minimarket", "Medical", "JanitorRoom",
];

export class Hud {
  private root: HTMLElement;
  private moneyEl!: HTMLElement;
  private clockEl!: HTMLElement;
  private guestEl!: HTMLElement;
  private popEl!: HTMLElement;
  private rpEl!: HTMLElement;
  private logEl!: HTMLElement;
  private paletteEl!: HTMLElement;
  private inspectorEl!: HTMLElement;

  private selected: BuildKind | null = null;
  private cb: HudCallbacks;

  constructor(root: HTMLElement, canvas: HTMLCanvasElement, cb: HudCallbacks) {
    this.root = root;
    this.cb = cb;
    this.build(canvas);
  }

  private build(canvas: HTMLCanvasElement): void {
    this.root.innerHTML = "";

    // ---- status bar ----
    const bar = document.createElement("header");
    bar.className = "statusbar";
    bar.innerHTML = `
      <div class="brand"><span class="logo"></span> Resort Empire <em>Reworked</em></div>
      <div class="stats">
        <div class="stat"><label>Money</label><b id="st-money">$0</b></div>
        <div class="stat"><label>Day</label><b id="st-day">1</b></div>
        <div class="stat"><label>Time</label><b id="st-clock">8:00 am</b></div>
        <div class="stat"><label>Guests</label><b id="st-guests">0</b></div>
        <div class="stat"><label>Popularity</label><b id="st-pop">0</b></div>
        <div class="stat"><label>Research</label><b id="st-rp">0</b></div>
      </div>`;
    this.root.appendChild(bar);
    this.moneyEl = bar.querySelector("#st-money")!;
    this.clockEl = bar.querySelector("#st-clock")!;
    this.guestEl = bar.querySelector("#st-guests")!;
    this.popEl = bar.querySelector("#st-pop")!;
    this.rpEl = bar.querySelector("#st-rp")!;
    const dayEl = bar.querySelector("#st-day") as HTMLElement;
    this.dayEl = dayEl;

    // ---- main body ----
    const body = document.createElement("div");
    body.className = "body";

    const left = document.createElement("aside");
    left.className = "panel left";
    left.innerHTML = `<div class="panel-title">Build</div>`;
    this.paletteEl = document.createElement("div");
    this.paletteEl.className = "palette";
    left.appendChild(this.paletteEl);

    const stage = document.createElement("main");
    stage.className = "stage";
    canvas.className = "view";
    stage.appendChild(canvas);

    const right = document.createElement("aside");
    right.className = "panel right";
    right.innerHTML = `<div class="panel-title">Inspector</div>`;
    this.inspectorEl = document.createElement("div");
    this.inspectorEl.className = "inspector";
    right.appendChild(this.inspectorEl);
    this.logEl = document.createElement("div");
    this.logEl.className = "log";
    right.appendChild(this.logEl);

    body.append(left, stage, right);
    this.root.appendChild(body);

    this.buildPalette();
  }

  private dayEl!: HTMLElement;

  private buildPalette(): void {
    this.paletteEl.innerHTML = "";

    const mkItem = (
      label: string,
      sub: string,
      price: number,
      onPick: () => void,
    ) => {
      const b = document.createElement("button");
      b.className = "item";
      b.innerHTML = `<span class="nm">${label}</span><span class="pr">$${price.toLocaleString()}</span><span class="sb">${sub}</span>`;
      b.addEventListener("click", () => onPick());
      return b;
    };

    const facTitle = document.createElement("div");
    facTitle.className = "group";
    facTitle.textContent = "Facilities";
    this.paletteEl.appendChild(facTitle);

    for (const id of FACILITY_ORDER) {
      if (!DATA.booths[id]) continue;
      const def = boothDef(id);
      const price = boothPrice(id, 0);
      const item = mkItem(def.nic, `${def.COLS}x${def.ROWS}`, price, () => {
        this.select({ kind: "booth", id });
      });
      item.dataset.id = id;
      this.paletteEl.appendChild(item);
    }

    const plantTitle = document.createElement("div");
    plantTitle.className = "group";
    plantTitle.textContent = "Scenery";
    this.paletteEl.appendChild(plantTitle);

    for (const id of DATA.sceneryListing) {
      const def = sceneryDef(id);
      const item = mkItem(def.nama, "plant", def.price, () => {
        this.select({ kind: "scenery", id });
      });
      item.dataset.id = id;
      this.paletteEl.appendChild(item);
    }
  }

  private select(sel: BuildKind): void {
    this.selected = this.selected &&
      this.selected.kind === sel.kind &&
      this.selected.id === sel.id ? null : sel;
    for (const el of Array.from(this.paletteEl.querySelectorAll<HTMLElement>(".item"))) {
      const id = el.dataset.id!;
      const active =
        this.selected !== null &&
        this.selected.id === id &&
        this.selected.kind === (el.parentElement?.querySelector(".group")?.textContent === "Facilities" ? "booth" : "scenery");
      el.classList.toggle("active", active);
    }
    this.cb.onSelect(this.selected);
  }

  get selection(): BuildKind | null {
    return this.selected;
  }

  clearSelection(): void {
    this.selected = null;
    for (const el of Array.from(this.paletteEl.querySelectorAll(".item"))) {
      el.classList.remove("active");
    }
    this.cb.onSelect(null);
  }

  update(world: World): void {
    const s = world.status();
    this.moneyEl.textContent = `$${Math.round(s.money).toLocaleString()}`;
    this.dayEl.textContent = String(s.day);
    this.clockEl.textContent = formatHour(s.hour);
    this.guestEl.textContent = `${s.guests}/${s.capacity}`;
    this.popEl.textContent = s.popularity.toFixed(2);
    this.rpEl.textContent = String(Math.round(s.research));
    this.root.classList.toggle("night", s.hour < 6 || s.hour >= 23);
  }

  /** Show details of the booth nearest to a world tile. */
  showInspector(world: World, boothId: number | null): void {
    if (boothId === null) {
      this.inspectorEl.innerHTML = `<p class="muted">Click a facility to inspect it.</p>`;
      return;
    }
    const b = world.booths.find((x) => x.id === boothId);
    if (!b) {
      this.inspectorEl.innerHTML = "";
      return;
    }
    const def = boothDef(b.type);
    const price = boothPrice(b.type, b.level + 1);
    const canUpgrade = b.level < 2 && world.money >= price;
    this.inspectorEl.innerHTML = `
      <h3>${def.nama}</h3>
      <dl>
        <dt>Level</dt><dd>${b.level + 1} / 3</dd>
        <dt>Served</dt><dd>${b.served}</dd>
        <dt>Satisfaction</dt><dd>${b.satisfaction.toFixed(0)}%</dd>
        <dt>Occupancy</dt><dd>${b.occupancy}</dd>
        <dt>Research pts</dt><dd>${b.rp}</dd>
      </dl>
      <div class="actions">
        <button id="btn-upgrade" ${canUpgrade ? "" : "disabled"}>Upgrade ($${price.toLocaleString()})</button>
        <button id="btn-demolish" class="danger">Demolish</button>
      </div>`;
    const up = this.inspectorEl.querySelector<HTMLButtonElement>("#btn-upgrade");
    if (up) up.addEventListener("click", () => this.cb.onUpgrade(b.id));
    const de = this.inspectorEl.querySelector<HTMLButtonElement>("#btn-demolish");
    if (de) de.addEventListener("click", () => this.cb.onDemolish(b.id));
  }

  pushLog(lines: string[]): void {
    if (lines.length === 0) return;
    for (const line of lines) {
      const div = document.createElement("div");
      div.textContent = line;
      this.logEl.prepend(div);
    }
    while (this.logEl.childElementCount > 40) {
      this.logEl.lastElementChild?.remove();
    }
  }
}
