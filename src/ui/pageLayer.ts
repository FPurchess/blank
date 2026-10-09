import { pageEngine } from "../engine/engine";
import { bootMark, record } from "../engine/perf";
import { theme } from "../state";
import { bitmapKey, engineId, pageBitmaps, paintQueue } from "./pageBitmaps";
import {
  type Layer,
  layerDisplay,
  type ThemeColors,
  themeColors,
} from "./pageLayers";
import type { PageBox } from "./pageViewModel";
import { painter, type Surface } from "./painter";

// One layer of a page frame (PageFrame.vue): its text, its header or footer
// strip, or its selected text, each painted into a canvas of its own when
// its version changes, from the queue and, for the text, from a kept bitmap
// (pageBitmaps.ts).

/**
 * sizeCanvas gives a canvas `width` × `height` device pixels, shown at
 * exactly that size, so nothing scales it and blurs the text
 * @returns whether its size changed, which clears it
 */
export const sizeCanvas = (
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
  ratio: number,
) => {
  if (canvas.width === width && canvas.height === height) return false;
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = `${width / ratio}px`;
  canvas.style.height = `${height / ratio}px`;
  return true;
};

// what of the frame a layer paints by: the page and where it is shown
export interface LayerFrame {
  page: number;
  width: number;
  height: number;
  x: number;
  y: number;
  scale: number;
  ratio: number;
  // just outside the view, which paints after the pages in view
  near: boolean;
}

// what a layer paints in: the colour of its text, and where it paints only
// within rectangles over a fill, e.g. the selection
export interface Look {
  key: string;
  color: string;
  within?: PageBox[];
  fill?: string;
}

// where a layer's canvas lies on the page, when it isn't all of it: from
// `top` CSS pixels down, `height` high
export interface Strip {
  top: number;
  height: number;
}

export const layerOf = ({
  frame,
  name,
  layer,
  element,
  version,
  images,
  strip,
  look,
}: {
  // the page frame the layer belongs to, as it is shown now
  frame: LayerFrame;
  // tells its paint jobs and bitmaps apart from the page's other layers
  name: string;
  layer: Layer;
  element: () => HTMLCanvasElement | null;
  version: () => number;
  images: () => string;
  // a strip of the page, or null for all of it
  strip: () => Strip | null;
  // how it is painted, e.g. only the selected text in its own colour; also
  // what tells its bitmaps apart
  look?: (colors: ThemeColors) => Look;
}) => {
  // a strip is a few glyphs, painted again rather than kept as a bitmap, and
  // so is a look of its own, the selection
  const keeps = !strip() && !look;
  const lookOf = (canvas: HTMLCanvasElement) => {
    const colors = themeColors(theme.value, canvas);
    return look ? look(colors) : { key: "", color: colors.text };
  };
  // what the canvas shows now, so the same isn't drawn twice
  let shown = "";
  // the canvas as the painter paints into it, taken when it's there
  let surface: Surface | null = null;
  const surfaceOf = (canvas: HTMLCanvasElement) => {
    if (surface?.canvas !== canvas) {
      if (surface) painter.release(surface);
      surface = painter.surface(canvas);
      shown = "";
    }
    return surface;
  };
  // the layer's canvas is gone, e.g. the bands' in "page ends": nothing of
  // it is kept or painted any more
  const release = () => {
    paintQueue.cancel(job());
    if (surface) painter.release(surface);
    surface = null;
    shown = "";
  };
  // a layer has its own place in the queue, so a newer request replaces one
  // that hasn't run yet
  const job = () => `${name}:${frame.page}`;

  const paintInto = (
    target: Surface,
    shows: Look,
    ratio: number,
    top: number,
  ) => {
    const engine = pageEngine;
    if (!engine) return;
    const start = performance.now();
    painter.paint(target, layerDisplay(engine, layer, frame.page, version()), {
      scale: frame.scale,
      ratio,
      x: frame.x,
      // the page's point at the strip's top
      y: frame.y + top / frame.scale,
      color: shows.color,
      within: shows.within,
      fill: shows.fill,
    });
    record("paint", performance.now() - start);
    bootMark("pages");
  };

  /**
   * paint shows the layer: drawn from its bitmap if it was painted before,
   * or else painted in the next frame, the pages in view first
   */
  const paint = () => {
    const canvas = element();
    if (!canvas) return release();
    if (!pageEngine) return;
    const { ratio } = frame;
    // a device pixel for each pixel of the canvas, which is shown at
    // exactly its size, so nothing scales it and blurs the text
    const place = strip();
    // on a whole device pixel, where the painting starts
    const top = place ? Math.round(place.top * ratio) / ratio : 0;
    const width = Math.round(frame.width * ratio);
    const height = Math.round((place ? place.height : frame.height) * ratio);
    if (sizeCanvas(canvas, width, height, ratio)) shown = "";
    if (place) canvas.style.top = `${top}px`;
    const shows = lookOf(canvas);
    const key = bitmapKey({
      engine: engineId(pageEngine),
      layer: name,
      page: frame.page,
      version: version(),
      width,
      height,
      scale: frame.scale,
      ratio,
      x: frame.x,
      y: frame.y + top / frame.scale,
      theme: theme.value,
      images: `${images()}${shows.key}`,
    });
    // what it shows already, e.g. after a change undone before its paint:
    // a paint still queued for the change would show the wrong key
    if (key === shown) return paintQueue.cancel(job());
    const target = surfaceOf(canvas);
    if (!target) return;
    const cached = keeps ? pageBitmaps.get(key) : undefined;
    if (cached) {
      paintQueue.cancel(job());
      painter.show(target, cached);
      shown = key;
      return;
    }
    // without snapshots, e.g. in tests: right away
    if (!painter.snapshots) {
      paintInto(target, shows, ratio, top);
      shown = key;
      return;
    }
    // until then the canvas shows what it showed, or the empty sheet
    paintQueue.request({
      key: job(),
      priority: frame.near ? 1 : 0,
      run: () => {
        // unless the page changed meanwhile, which asks again
        if (
          element() !== canvas ||
          canvas.width !== width ||
          canvas.height !== height
        )
          return;
        paintInto(target, lookOf(canvas), ratio, top);
        shown = key;
      },
    });
  };

  /**
   * keep keeps what the canvas shows for when the page comes into view
   * again, as it leaves: a copy only of the pages that go, not of every
   * paint
   */
  const keep = () => {
    const kept = surface;
    if (!element() || !shown || !kept) return release();
    if (!keeps || !painter.snapshots || pageBitmaps.get(shown))
      return release();
    const key = shown;
    paintQueue.cancel(job());
    surface = null;
    // freed once the copy is taken
    painter.snapshot(kept).then(
      (snapshot) => {
        // in place of what the layer showed before at this scale
        if (snapshot) pageBitmaps.set(key, snapshot, `${job()}:${frame.scale}`);
        painter.release(kept);
      },
      () => painter.release(kept),
    );
  };

  return { paint, keep };
};
