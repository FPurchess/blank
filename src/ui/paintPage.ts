import type { PageDisplay } from "../engine/engine";

// Paints what the engine laid out on a page into a canvas: every glyph as
// its outline from the font file, at the spot the layout gave it, which is
// also where the PDF puts it.

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
];

export interface PaintOptions {
  // CSS pixels per point, and device pixels per CSS pixel
  scale: number;
  ratio: number;
  // the page's point at the canvas' top left corner
  x: number;
  y: number;
  // the theme's text colour
  color: string;
  glyph: (font: number, id: number) => Path2D;
  unitsPerEm: (font: number) => number;
  image: (src: string) => CanvasImageSource | null;
}

/**
 * paintPage paints `display` into a canvas' context, which it clears first
 */
export const paintPage = (
  context: CanvasRenderingContext2D,
  display: PageDisplay,
  options: PaintOptions,
) => {
  const k = options.scale * options.ratio;
  const px = (x: number) => (x - options.x) * k;
  const py = (y: number) => (y - options.y) * k;
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  context.fillStyle = options.color;
  for (const [x, y, w, h, role] of display.r) {
    context.globalAlpha = ROLE_OPACITY[role] ?? 1;
    // lines stay at least a device pixel thick
    context.fillRect(px(x), py(y), Math.max(w * k, 1), Math.max(h * k, 1));
  }
  context.globalAlpha = 1;
  for (const [src, x, y, w, h] of display.i) {
    const image = options.image(src);
    if (image) context.drawImage(image, px(x), py(y), w * k, h * k);
  }
  for (const run of display.g) {
    const [font, size, role] = run;
    context.globalAlpha = ROLE_OPACITY[role] ?? 1;
    const s = (size / options.unitsPerEm(font)) * k;
    for (let index = 3; index + 2 < run.length; index += 3) {
      context.setTransform(s, 0, 0, -s, px(run[index + 1]), py(run[index + 2]));
      context.fill(options.glyph(font, run[index]));
    }
  }
  context.setTransform(1, 0, 0, 1, 0, 0);
  context.globalAlpha = 1;
};
