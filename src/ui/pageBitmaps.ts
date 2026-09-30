// The painted pages, kept as bitmaps, and the queue that paints them. A page
// scrolled back into view is drawn from its bitmap in an instant, and a page
// is never painted inside a scroll or a render: a request waits for the next
// frame, which paints the pages in view first and those just outside it after
// them, within a budget per frame.

import type { Snapshot } from "./painter";

// a painted page, as the painter keeps it
export type Bitmap = Snapshot;

/**
 * BitmapCache keeps the painted pages by what they show, the least recently
 * used going first once they take more than `limit` bytes
 */
export class BitmapCache {
  private bitmaps = new Map<string, Bitmap>();
  private bytes = 0;

  constructor(private limit: number) {}

  get(key: string): Bitmap | undefined {
    const bitmap = this.bitmaps.get(key);
    if (bitmap) {
      // the most recently used last
      this.bitmaps.delete(key);
      this.bitmaps.set(key, bitmap);
    }
    return bitmap;
  }

  set(key: string, bitmap: Bitmap) {
    this.delete(key);
    this.bitmaps.set(key, bitmap);
    this.bytes += bitmap.width * bitmap.height * 4;
    for (const oldest of this.bitmaps.keys()) {
      if (this.bytes <= this.limit || oldest === key) break;
      this.delete(oldest);
    }
  }

  delete(key: string) {
    const bitmap = this.bitmaps.get(key);
    if (!bitmap) return;
    this.bitmaps.delete(key);
    this.bytes -= bitmap.width * bitmap.height * 4;
    bitmap.close?.();
  }

  clear() {
    for (const key of [...this.bitmaps.keys()]) this.delete(key);
  }

  get size() {
    return this.bitmaps.size;
  }

  // the keys of what it keeps, the least recently used first
  keys() {
    return this.bitmaps.keys();
  }

  get used() {
    return this.bytes;
  }
}

export interface PaintJob {
  // what it paints, one job per key at a time
  key: string;
  // lower first: the pages in view before those near it
  priority: number;
  run: () => void;
}

export interface Scheduler {
  frame: (callback: () => void) => unknown;
  later: (callback: () => void) => unknown;
  now: () => number;
}

const browserScheduler: Scheduler = {
  frame: (callback) => requestAnimationFrame(callback),
  later: (callback) => setTimeout(callback),
  now: () => performance.now(),
};

// how long painting may take of a frame, in ms
export const FRAME_BUDGET = 8;

/**
 * PaintQueue runs the paint jobs: those in view in the next frame, all of
 * them if need be, and the rest a few at a time within the frame's budget,
 * in later tasks, so the view keeps scrolling meanwhile
 */
export class PaintQueue {
  private jobs = new Map<string, PaintJob>();
  private scheduled = false;

  constructor(
    private scheduler: Scheduler = browserScheduler,
    // the jobs with a priority below it paint in the next frame whatever
    // they take
    private urgent = 1,
  ) {}

  request(job: PaintJob) {
    this.jobs.set(job.key, job);
    this.schedule();
  }

  cancel(key: string) {
    this.jobs.delete(key);
  }

  get pending() {
    return this.jobs.size;
  }

  private schedule() {
    if (this.scheduled) return;
    this.scheduled = true;
    this.scheduler.frame(() => this.run(true));
  }

  private run(inFrame: boolean) {
    this.scheduled = false;
    const start = this.scheduler.now();
    const jobs = [...this.jobs.values()].sort(
      (a, b) => a.priority - b.priority,
    );
    for (const job of jobs) {
      const urgent = inFrame && job.priority < this.urgent;
      if (!urgent && this.scheduler.now() - start > FRAME_BUDGET) break;
      this.jobs.delete(job.key);
      // one that fails leaves the others to paint
      try {
        job.run();
      } catch (error) {
        console.error("painting a page failed", error);
      }
    }
    if (this.jobs.size === 0) return;
    // the rest after the frame, in a task of its own
    this.scheduled = true;
    this.scheduler.later(() => this.run(false));
  }
}

// at 2× an A4 sheet is about 14 MB; this keeps a dozen or so
export const BITMAP_LIMIT = 192 * 1024 * 1024;

export const pageBitmaps = new BitmapCache(BITMAP_LIMIT);
export const paintQueue = new PaintQueue();

// a number for each engine: a page's version counts up within one engine,
// and a new engine starts again from 1
const engines = new WeakMap<object, number>();
let engineCount = 0;

/**
 * engineId returns the number of an engine, the same for as long as it lives
 */
export const engineId = (engine: object) => {
  let id = engines.get(engine);
  if (id === undefined) {
    id = ++engineCount;
    engines.set(engine, id);
  }
  return id;
};

/**
 * bitmapKey tells apart everything that changes what a painted page shows
 */
export const bitmapKey = (parts: {
  engine: number;
  // the layer of the page, e.g. its text or its header and footer
  layer: string;
  page: number;
  version: number;
  width: number;
  height: number;
  scale: number;
  ratio: number;
  x: number;
  y: number;
  theme: string;
  // which of its images are loaded
  images: number | string;
}) =>
  [
    parts.engine,
    parts.layer,
    parts.page,
    parts.version,
    parts.width,
    parts.height,
    parts.scale.toFixed(4),
    parts.ratio,
    parts.x.toFixed(2),
    parts.y.toFixed(2),
    parts.theme,
    parts.images,
  ].join("|");
