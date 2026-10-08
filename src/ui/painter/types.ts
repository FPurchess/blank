import type { PageDisplay } from "../../engine/engine";

// What paints the pages: the page view (PageFrame.vue) and the bitmap cache
// (pageBitmaps.ts) only talk to a Painter, so the way the pages are painted
// can change without them. Canvas 2D paints them today (canvas2d.ts). A GPU
// backend, e.g. Vello's vello_gpu on WebGL2 with vello_cpu as its fallback,
// plugs in here.

export interface PaintOptions {
  // CSS pixels per point, and device pixels per CSS pixel
  scale: number;
  ratio: number;
  // the page's point at the canvas' top left corner
  x: number;
  y: number;
  // the theme's text color, as CSS, or a color for each role instead,
  // opaque, e.g. the colors on paper
  color?: string;
  colors?: readonly string[];
  // what the canvas is filled with first, transparent if none
  background?: string;
  // only within these rectangles of the page, in points, over `fill`: the
  // selected text in its own colour over the selection
  within?: { x: number; y: number; width: number; height: number }[];
  fill?: string;
}

// a painted page kept for later; what it holds is the painter's own
export interface Snapshot {
  width: number;
  height: number;
  close?: () => void;
}

// a canvas of the page view as a painter paints into it, sized in device
// pixels
export interface Surface {
  readonly canvas: HTMLCanvasElement;
}

export interface Painter {
  // whether it keeps snapshots; without them a page paints right away, e.g.
  // in tests
  readonly snapshots: boolean;
  // the surface of a canvas, null if the canvas can't be painted
  surface(canvas: HTMLCanvasElement): Surface | null;
  // paints what the engine laid out on a page, over nothing
  paint(surface: Surface, display: PageDisplay, options: PaintOptions): void;
  clear(surface: Surface): void;
  // keeps what the surface shows, null if it can't
  snapshot(surface: Surface): Promise<Snapshot | null>;
  // shows a snapshot this painter made
  show(surface: Surface, snapshot: Snapshot): void;
  // frees what a surface holds, once its canvas is gone from the page
  release(surface: Surface): void;
}
