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
}

export interface SpriteEntry {
  chid: number;
  class: string;
  frames: SpriteFrame[];
  booth?: string;
  variant?: number;
}

export interface ArtManifest {
  booths: Record<string, SpriteEntry>;
  visitors: Record<string, SpriteEntry>;
  framesets: Record<string, SpriteEntry>;
  other: Record<string, SpriteEntry>;
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
    for (const group of [manifest.booths, manifest.visitors, manifest.framesets, manifest.other]) {
      for (const entry of Object.values(group)) {
        for (const f of entry.frames) files.push(f.file);
      }
    }
    for (const file of Object.values(manifest.images ?? {})) files.push(file);

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
   */
  boothTileFrame(fr: number, level = 0): SpriteFrame | undefined {
    const entry = this.frameSet("boothTile");
    if (!entry || entry.frames.length === 0) return undefined;
    const idx = Math.max(0, Math.min(entry.frames.length - 1, fr - 1 + level));
    return entry.frames[idx];
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
  frameByLabel(entry: SpriteEntry | undefined, label: string): SpriteFrame | undefined {
    if (!entry) return undefined;
    return entry.frames.find((f) => f.label === label);
  }

  /** The frame for a facility at a given upgrade level. */
  boothFrame(type: string, level: number): SpriteFrame | undefined {
    const entry = this.booth(type);
    if (!entry) return undefined;
    return (
      this.frameByLabel(entry, `level_${level + 1}`) ??
      // Facilities that have no level frames still need something to show.
      entry.frames.find((f) => f.label !== "_build") ??
      entry.frames[0]
    );
  }
}

export const art = new Art();
