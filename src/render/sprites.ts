/**
 * Loads the artwork that was extracted from the original game's SWF.
 *
 * The art pipeline lives in `tools/`:
 *   - JPEXS exports each `DefineSprite` as a PNG and as an SVG
 *   - `tools/build_art_manifest.py` combines them into `public/art/manifest.json`
 *
 * The SVG contributes the anchor: where the sprite's own origin ended up
 * inside the cropped PNG, which is what lets the art sit on the isometric
 * grid correctly.
 *
 * If a piece of art is missing the renderer falls back to the procedural
 * shapes in `art.ts`, so the game always runs.
 */

export interface SpriteFrame {
  file: string;
  w: number;
  h: number;
  /** Sprite origin within the PNG, measured from the top left. */
  ox: number;
  oy: number;
  /** The animation this frame is, e.g. `walk_front` or `level_2`. */
  label?: string;
  /** The visible pixels of the frame, in PNG pixels. */
  bbox?: [number, number, number, number];
  /** Whether the frame carries the red marking of a plot that can grow. */
  marked?: boolean;
}

export interface SpriteEntry {
  chid: number;
  class: string;
  frames: SpriteFrame[];
  booth?: string;
  variant?: number;
}

/** A person who stands in a room, and where they stand. */
export interface RoomPerson {
  chid: number;
  class: string;
  file: string;
  w: number;
  h: number;
  ox: number;
  oy: number;
  /** How far the person stands from the room's own origin, in PNG pixels. */
  dx: number;
  dy: number;
}

/** A room, and the people who can be in it. */
export interface RoomEntry {
  chid: number;
  class?: string;
  frames: SpriteFrame[];
  people: Record<string, RoomPerson>;
}

export interface ArtManifest {
  booths: Record<string, SpriteEntry>;
  visitors: Record<string, SpriteEntry>;
  framesets: Record<string, SpriteEntry>;
  other: Record<string, SpriteEntry>;
  /** The room of every facility, without the people in it. */
  rooms?: Record<string, RoomEntry>;
  /** Standalone bitmaps, e.g. the plot's sand floor. */
  images?: Record<string, string>;
}

export class Art {
  manifest: ArtManifest | null = null;
  private images = new Map<string, HTMLImageElement>();
  private base = "/art/";

  get ready(): boolean {
    return this.manifest !== null;
  }

  /**
   * Load the artwork the game needs to draw the resort.
   *
   * The ground, the facilities and the guests are all needed before the
   * resort can be shown, so they are loaded first. The rest - the staff
   * animations, the clips of guests inside facilities - are loaded
   * afterwards by `loadExtra`, so the game starts straight away.
   */
  async load(onProgress?: (loaded: number, total: number) => void): Promise<void> {
    let manifest: ArtManifest;
    try {
      const res = await fetch(`${this.base}manifest.json`);
      if (!res.ok) throw new Error(String(res.status));
      manifest = (await res.json()) as ArtManifest;
    } catch {
      // No art available: the procedural fallback takes over.
      return;
    }
    this.manifest = manifest;

    const files: string[] = [];
    for (const group of [manifest.booths, manifest.visitors, manifest.framesets]) {
      for (const entry of Object.values(group)) {
        for (const f of entry.frames) files.push(f.file);
      }
    }
    // The rooms, and the people who can be in them.
    for (const room of Object.values(manifest.rooms ?? {})) {
      for (const f of room.frames) files.push(f.file);
      for (const person of Object.values(room.people)) files.push(person.file);
    }
    for (const file of Object.values(manifest.images ?? {})) files.push(file);

    await this.loadFiles(files, onProgress);
  }

  /** Load the rest of the artwork, in the background. */
  async loadExtra(onProgress?: (loaded: number, total: number) => void): Promise<void> {
    const extra = this.manifest?.other;
    if (!extra) return;
    const files: string[] = [];
    for (const entry of Object.values(extra)) {
      for (const f of entry.frames) files.push(f.file);
    }
    await this.loadFiles(files, onProgress);
  }

  private async loadFiles(
    files: string[],
    onProgress?: (loaded: number, total: number) => void,
  ): Promise<void> {
    let loaded = 0;
    await Promise.all(
      files.map(
        (file) =>
          new Promise<void>((resolve) => {
            const img = new Image();
            img.onload = img.onerror = () => {
              this.images.set(file, img);
              loaded++;
              onProgress?.(loaded, files.length);
              resolve();
            };
            img.src = this.base + file;
          }),
      ),
    );
  }

  image(file: string): HTMLImageElement | undefined {
    return this.images.get(file);
  }

  booth(type: string): SpriteEntry | undefined {
    return this.manifest?.booths[type];
  }

  visitor(variant: number): SpriteEntry | undefined {
    return this.manifest?.visitors[String(variant)];
  }

  frameSet(name: string): SpriteEntry | undefined {
    return this.manifest?.framesets[name];
  }

  /**
   * A named clip from the original, such as the staff of a facility.
   *
   * Everything the game does not use by name lives in `other`, keyed by the
   * class the original gave the clip.
   */
  named(name: string): SpriteEntry | undefined {
    return this.manifest?.other?.[name];
  }

  /**
   * The frame of a frame-set whose index matches a Flash frame number.
   *
   * The original addresses art by frame number (each tile type records the
   * frame it uses), and Flash frame numbers are one based.
   */
  frameFor(name: string, frameNumber: number): SpriteFrame | undefined {
    const entry = this.frameSet(name);
    if (!entry || entry.frames.length === 0) return undefined;
    const idx = Math.max(0, Math.min(entry.frames.length - 1, frameNumber - 1));
    return entry.frames[idx];
  }

  /** A standalone bitmap, e.g. the plot's sand floor. */
  imageAsset(name: string): HTMLImageElement | undefined {
    const file = this.manifest?.images?.[name];
    return file ? this.images.get(file) : undefined;
  }

  /**
   * The floor plate for a facility.
   *
   * The original records a `fr` frame per facility and draws `fr` plus the
   * upgrade level from a separate frame set of pre-rendered floor shapes
   * (`Booth.as`, `creatingLantai`).
   *
   * Some of those plates carry the original's red marking on the tile the
   * facility can take over when it is upgraded, and the marking is shown as
   * it is, because it is what says the facility still has room to grow. The
   * frame is used exactly as the original uses it: stepping over a marked
   * plate would put the next facility's floor underneath this one.
   */
  boothTileFrame(fr: number, level = 0): SpriteFrame | undefined {
    const entry = this.frameSet("boothTile");
    if (!entry || entry.frames.length === 0) return undefined;
    const idx = Math.max(0, Math.min(entry.frames.length - 1, fr - 1 + level));
    return entry.frames[idx];
  }

  /**
   * The red outline the original draws around the tile a facility can grow
   * into.
   *
   * The original has a `Redground1x1` clip for it, and the same marking is
   * baked into the floor plates it renders, so a facility that can still grow
   * shows the spare tile picked out in red.
   */
  redGroundFrame(): SpriteFrame | undefined {
    const entry = this.manifest?.other?.["Redground1x1_271"];
    return entry?.frames?.[0];
  }

  /**
   * The room a facility is built in.
   *
   * The original keeps a separate `Wall` clip with the interior of every
   * room; `Booth.as` draws the frame recorded in the facility's `wall` and
   * `wall_alpha` fields, one set per upgrade level.
   */
  wallFrame(wall: number, level = 0): SpriteFrame | undefined {
    const entry = this.frameSet("wall");
    if (!entry || entry.frames.length === 0) return undefined;
    const idx = Math.max(0, Math.min(entry.frames.length - 1, wall - 1 + level));
    return entry.frames[idx];
  }

  /**
   * The frame of a sprite with a given label.
   *
   * The original addresses its animations by name - `walk_front` for a guest
   * walking towards the camera, `level_2` for a facility at its second
   * upgrade - so the labels recovered from the SWF are what let the original
   * artwork be used as-is.
   */
  frameByLabel(
    entry: (SpriteEntry | RoomEntry) | undefined,
    label: string,
  ): SpriteFrame | undefined {
    if (!entry) return undefined;
    return entry.frames.find((f) => f.label === label);
  }

  /**
   * The frame of a facility's room.
   *
   * The original's room clip holds the room itself - the counter of a
   * restaurant, the beds of a cottage - together with the people in it, and
   * it names its frames after the upgrade the room is at: `level_1` for a
   * new facility, `level_3` for a fully upgraded one. The frame the room
   * shows is the one the original stops on (`Booth.as`, `acceptLevelObject`),
   * so that is the one to draw.
   *
   * The room is drawn without the people: the original hides them while the
   * room is empty, and they are put back in `roomPerson`.
   */
  roomFrame(type: string, level: number, building = false): SpriteFrame | undefined {
    const entry = this.room(type);
    if (!entry || entry.frames.length === 0) return undefined;
    if (building) {
      // While the facility is being built the original shows the room as an
      // empty plot.
      return this.frameByLabel(entry, "_build") ?? entry.frames[0];
    }
    return (
      this.frameByLabel(entry, `level_${level + 1}`) ??
      // Facilities that have no level frames still need something to show.
      this.frameByLabel(entry, "level_1") ??
      entry.frames.find((f) => f.label !== "_build") ??
      entry.frames[0]
    );
  }

  /** The room of a facility, without the people in it. */
  room(type: string): RoomEntry | undefined {
    return this.manifest?.rooms?.[type];
  }

  /**
   * A person who stands in a room, and where they stand in it.
   *
   * The original's room clip holds the employee and the guests as children
   * of the room, each with its own place in it.
   */
  roomPerson(
    type: string,
    who: "employee" | "visitor1" | "visitor2",
  ): { frame: SpriteFrame; person: RoomPerson } | undefined {
    const person = this.room(type)?.people?.[who];
    if (!person) return undefined;
    return {
      frame: {
        file: person.file,
        w: person.w,
        h: person.h,
        ox: person.ox,
        oy: person.oy,
      },
      person,
    };
  }
}

export const art = new Art();
