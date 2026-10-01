import { pageEngine } from "../../engine/engine";
import { loadedImage } from "../../engine/images";
import { path } from "../../state";
import { Canvas2DPainter } from "./canvas2d";
import type { Painter } from "./types";

export type { Painter, PaintOptions, Snapshot, Surface } from "./types";

// the painter of the page view: the glyphs come from the engine, which keeps
// their outlines, and the images once the webview loaded them
export let painter: Painter = new Canvas2DPainter({
  glyphs: () => pageEngine,
  image: (src) => loadedImage(src, path.value)?.image ?? null,
});

/**
 * setPainter paints the pages with another painter from now on, e.g. one
 * that records in a test
 */
export const setPainter = (next: Painter) => {
  painter = next;
};
