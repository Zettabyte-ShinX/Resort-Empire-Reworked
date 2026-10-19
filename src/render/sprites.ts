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
}

export const art = new Art();
