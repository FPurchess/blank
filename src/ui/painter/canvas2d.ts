import type { PageDisplay, PageEngine } from "../../engine/engine";
import { onPaper } from "../../layout/paperColors";
import type { Painter, PaintOptions, Snapshot, Surface } from "./types";

// Paints what the engine laid out on a page into a canvas with Canvas 2D:
// every glyph as its outline from the font file, at the spot the layout gave
// it, which is also where the PDF puts it.

// what the roles of the engine stand for on screen (see Role in
// src-tauri/layout/src/items/mod.rs):
// the theme's text colour at an opacity
export const ROLE_OPACITY = [
  1, // text
  0.5, // header and footer
  0.07, // code
  0.2, // table lines
  0.55, // the line under the header rows
  0.06, // header cells
  0.15, // the box of a picture to come
  0.5, // the underline of a link, softer than the text as in the editor
  0.6, // the alt text of an image that isn't loaded
];

// the paper the printer prints on, white whatever the theme
export const PAPER = "#ffffff";

// the color of each role on paper, as the PDF prints it (paper_rgb in
// src-tauri/layout/src/pdf.rs, checked by colors.test.ts): the light theme's
// text color mixed onto white at the role's opacity, except black text,
// links and alt text, and grey headers and footers
export const PAPER_COLORS = ROLE_OPACITY.map((opacity, role) =>
  role === 0 || role === 7 || role === 8
    ? "#000000"
    : role === 1
      ? "#666666"
      : onPaper(opacity),
);

// where the glyphs' outlines come from: the engine, which keeps them
export type GlyphSource = Pick<PageEngine, "glyph" | "unitsPerEm">;

export interface Canvas2DSources {
  glyphs: () => GlyphSource | null;
  // a loaded image, null while it isn't; a drawing of Blank's in `ink`,
  // the colour the text is painted in (see src/engine/vectors.ts)
  image: (src: string, ink: string) => CanvasImageSource | null;
}

interface Canvas2DSurface extends Surface {
  context: CanvasRenderingContext2D;
}

interface Canvas2DSnapshot extends Snapshot {
  bitmap: ImageBitmap;
}

// the drawings' paths as the canvas takes them, by their data, a few
// thousand kept
const PATHS_KEPT = 4096;
const paths = new Map<string, Path2D>();
const pathOf = (d: string) => {
  let path = paths.get(d);
  if (!path) {
    if (paths.size >= PATHS_KEPT) paths.clear();
    path = new Path2D(d);
    paths.set(d, path);
  }
  return path;
};

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
  if (options.background) {
    context.fillStyle = options.background;
    context.fillRect(0, 0, context.canvas.width, context.canvas.height);
  }
  // a role's color, as `fillStyle` and `globalAlpha`
  const colors = options.colors;
  // a role's ink and its strength: on paper its colour, opaque (print),
  // otherwise the view's ink at the role's opacity
  const inkOf = (role: number): [string, number] =>
    colors
      ? [colors[role] ?? colors[0], 1]
      : [options.color ?? "", ROLE_OPACITY[role] ?? 1];
  const paint = (role: number) => {
    if (colors) {
      context.fillStyle = colors[role] ?? colors[0];
      context.globalAlpha = 1;
    } else context.globalAlpha = ROLE_OPACITY[role] ?? 1;
  };
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
  if (options.color) context.fillStyle = options.color;
  for (const [x, y, w, h, role] of display.r) {
    paint(role);
    // on whole device pixels, so lines are crisp, and at least one thick
    const left = Math.round(px(x));
    const top = Math.round(py(y));
    const width = Math.max(Math.round(px(x + w)) - left, 1);
    const height = Math.max(Math.round(py(y + h)) - top, 1);
    context.fillRect(left, top, width, height);
  }
  // the paths of drawings (diagrams), in page points: in the ink at their
  // strength, or in the author's colour
  const paths = display.p ?? [];
  for (const [role, stroke, d, alpha, color, style] of paths) {
    const [ink, strength] = inkOf(role);
    context.globalAlpha = strength * alpha;
    context.setTransform(k, 0, 0, k, -options.x * k, -options.y * k);
    const fill = color || ink;
    if (stroke > 0) {
      context.strokeStyle = fill;
      context.lineWidth = stroke;
      context.lineCap = style?.cap ?? "butt";
      context.lineJoin = style?.join ?? "miter";
      context.setLineDash(style?.dash ?? []);
      context.lineDashOffset = style?.offset ?? 0;
      context.stroke(pathOf(d));
    } else {
      context.fillStyle = fill;
      context.fill(pathOf(d), style?.evenodd ? "evenodd" : "nonzero");
    }
  }
  if (paths.length) context.setLineDash([]);
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = 1;
  // a drawing's picture in the text's ink (Blank's own drawings follow it)
  const [textInk] = inkOf(0);
  for (const [src, x, y, w, h] of display.i) {
    const loaded = image(src, textInk);
    if (loaded) context.drawImage(loaded, px(x), py(y), w * k, h * k);
  }
  // drawings' runs in their paint: the ink at a strength, or the author's
  // colour
  const paints = new Map(
    (display.gp ?? []).map(([index, alpha, color]) => [
      index,
      { alpha, color },
    ]),
  );
  for (const [index, run] of display.g.entries()) {
    const [font, size, role] = run;
    // the role's ink, or a drawing's paint: its strength of the ink, or
    // the author's colour
    const drawn = paints.get(index);
    const [ink, strength] = inkOf(role);
    context.fillStyle = drawn?.color ?? ink;
    context.globalAlpha = strength * (drawn?.alpha ?? 1);
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
