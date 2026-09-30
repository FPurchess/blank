import type { PageDisplay, PageEngine } from "../../engine/engine";
import type { Painter, PaintOptions, Snapshot, Surface } from "./types";

// Paints what the engine laid out on a page into a canvas with Canvas 2D:
// every glyph as its outline from the font file, at the spot the layout gave
// it, which is also where the PDF puts it.

// what the roles of the engine stand for on screen (see Role in items.rs):
// the theme's text colour at an opacity
export const ROLE_OPACITY = [
  1, // text
  0.5, // header and footer
  0.07, // code
  0.2, // table lines
  0.55, // the line under the header rows
  0.05, // header cells
  0.15, // an image that isn't loaded yet
  0.5, // the underline of a link, softer than the text as in the editor
  0.6, // the alt text of an image that isn't loaded
];

// where the glyphs' outlines come from: the engine, which keeps them
export type GlyphSource = Pick<PageEngine, "glyph" | "unitsPerEm">;

export interface Canvas2DSources {
  glyphs: () => GlyphSource | null;
  // a loaded image, null while it isn't
  image: (src: string) => CanvasImageSource | null;
}

interface Canvas2DSurface extends Surface {
  context: CanvasRenderingContext2D;
}

interface Canvas2DSnapshot extends Snapshot {
  bitmap: ImageBitmap;
}

/**
 * paintDisplay paints `display` into a canvas' context, which it clears
 * first
 */
export const paintDisplay = (
  context: CanvasRenderingContext2D,
  display: PageDisplay,
  options: PaintOptions,
  glyphs: GlyphSource,
  image: Canvas2DSources["image"],
) => {
  const k = options.scale * options.ratio;
  const px = (x: number) => (x - options.x) * k;
  const py = (y: number) => (y - options.y) * k;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  if (options.within) {
    // what lies outside the rectangles isn't painted, and they're filled
    context.save();
    context.beginPath();
    for (const rect of options.within) {
      context.rect(
        Math.round(px(rect.x)),
        Math.round(py(rect.y)),
        Math.round(px(rect.x + rect.width)) - Math.round(px(rect.x)),
        Math.round(py(rect.y + rect.height)) - Math.round(py(rect.y)),
      );
    }
    context.clip();
    if (options.fill) {
      context.fillStyle = options.fill;
      context.fillRect(0, 0, context.canvas.width, context.canvas.height);
    }
  }
  context.fillStyle = options.color;
  for (const [x, y, w, h, role] of display.r) {
    context.globalAlpha = ROLE_OPACITY[role] ?? 1;
    // on whole device pixels, so lines are crisp, and at least one thick
    const left = Math.round(px(x));
    const top = Math.round(py(y));
    const width = Math.max(Math.round(px(x + w)) - left, 1);
    const height = Math.max(Math.round(py(y + h)) - top, 1);
    context.fillRect(left, top, width, height);
  }
  context.globalAlpha = 1;
  for (const [src, x, y, w, h] of display.i) {
    const loaded = image(src);
    if (loaded) context.drawImage(loaded, px(x), py(y), w * k, h * k);
  }
  for (const run of display.g) {
    const [font, size, role] = run;
    context.globalAlpha = ROLE_OPACITY[role] ?? 1;
    const s = (size / glyphs.unitsPerEm(font)) * k;
    for (let index = 3; index + 2 < run.length; index += 3) {
      // the baseline on a whole device pixel, as the webview sets its text,
      // so the horizontal strokes are sharp; across it the glyphs keep the
      // layout's positions
      context.setTransform(
        s,
        0,
        0,
        -s,
        px(run[index + 1]),
        Math.round(py(run[index + 2])),
      );
      context.fill(glyphs.glyph(font, run[index]));
    }
  }
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = 1;
  if (options.within) context.restore();
};

/**
 * Canvas2DPainter paints the pages with the canvas' 2D context, and keeps
 * them as ImageBitmaps
 */
export class Canvas2DPainter implements Painter {
  constructor(private sources: Canvas2DSources) {}

  get snapshots() {
    return typeof createImageBitmap !== "undefined";
  }

  surface(canvas: HTMLCanvasElement): Canvas2DSurface | null {
    const context = canvas.getContext("2d");
    return context ? { canvas, context } : null;
  }

  paint(surface: Surface, display: PageDisplay, options: PaintOptions) {
    const glyphs = this.sources.glyphs();
    if (!glyphs) return;
    paintDisplay(
      (surface as Canvas2DSurface).context,
      display,
      options,
      glyphs,
      this.sources.image,
    );
  }

  clear(surface: Surface) {
    const { context, canvas } = surface as Canvas2DSurface;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, canvas.width, canvas.height);
  }

  async snapshot(surface: Surface): Promise<Snapshot | null> {
    if (!this.snapshots) return null;
    const { canvas } = surface;
    const { width, height } = canvas;
    try {
      const bitmap = await createImageBitmap(canvas);
      const snapshot: Canvas2DSnapshot = {
        bitmap,
        width,
        height,
        close: () => bitmap.close(),
      };
      return snapshot;
    } catch {
      return null;
    }
  }

  // a canvas without pixels holds no backing store, which would otherwise
  // stay until the canvas is collected
  release(surface: Surface) {
    surface.canvas.width = 0;
    surface.canvas.height = 0;
  }

  show(surface: Surface, snapshot: Snapshot) {
    this.clear(surface);
    (surface as Canvas2DSurface).context.drawImage(
      (snapshot as Canvas2DSnapshot).bitmap,
      0,
      0,
    );
  }
}
