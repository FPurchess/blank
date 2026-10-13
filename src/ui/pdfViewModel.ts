import type { FrameLayout, PageSize } from "../engine/frames";
import { paperName } from "../layout/describe";
import { matchPaper, PAPER } from "../layout/paper";
import type { Unit } from "../layout/units";
import { sectionAt } from "../readingLine";

// What the page view of PDFs (PdfView.vue) works out: at what scale a page
// is drawn, its bitmaps' keys, which page is in view, and how the status
// bar names the paper.

// the most pixels a page is drawn with, as the helper allows (MAX_PIXELS in
// src-tauri/pdf/ipc/src/protocol.rs): 16 MP, a 4096 × 4096 square
export const MAX_PAGE_PIXELS = 1 << 24;
// a page is drawn at a scale of whole eighths, so a window being resized
// doesn't draw it again for every pixel
const SCALE_STEPS = 8;

/**
 * renderScale returns the device pixels per point a page of `size` is drawn
 * with when it shows at `scale` CSS pixels per point on a screen of `ratio`
 * device pixels per CSS pixel: the next eighth up, at most MAX_PAGE_PIXELS.
 * A page past that shows slightly soft.
 */
export const renderScale = (size: PageSize, scale: number, ratio: number) => {
  const wanted = Math.ceil(scale * ratio * SCALE_STEPS) / SCALE_STEPS;
  const most = Math.sqrt(MAX_PAGE_PIXELS / (size.width * size.height));
  return Math.max(
    1 / SCALE_STEPS,
    Math.min(wanted, Math.floor(most * SCALE_STEPS) / SCALE_STEPS),
  );
};

/**
 * pageSlot names what a bitmap shows, but for its scale: a page of a PDF in
 * a tab; the cache keeps one bitmap per slot (see BitmapCache)
 */
export const pageSlot = (tab: string, sha256: string, page: number) =>
  `${tab}|${sha256}|${page}`;

/**
 * pageKey names a bitmap of a page of a PDF in a tab at `scale`
 */
export const pageKey = (slot: string, scale: number) => `${slot}|${scale}`;

/**
 * closedKeys returns the keys of the bitmaps of PDF tabs that closed
 * @param open the PDF tabs open
 */
export const closedKeys = (keys: Iterable<string>, open: ReadonlySet<string>) =>
  [...keys].filter((key) => !open.has(key.slice(0, key.indexOf("|"))));

/**
 * pageInView returns the page (from 0) at the reading line of a view
 * `height` pixels high scrolled to `top`, as "Page N of M" counts it in a
 * markdown tab
 */
export const pageInView = (layout: FrameLayout, top: number, height: number) =>
  sectionAt(
    layout.frames.map((frame) => frame.top),
    top,
    height,
    layout.height - height,
  );

/**
 * pdfPaper names the paper of a PDF's page, e.g. "A4", "Letter landscape"
 * or "210 × 99 mm", as the status bar does a document's
 */
export const pdfPaper = (page: PageSize, unit: Unit) => {
  const name = matchPaper(page.width, page.height);
  if (!name) return paperName(page, unit);
  return page.width > page.height
    ? `${PAPER[name].label} landscape`
    : PAPER[name].label;
};

/**
 * scrollBy returns how far a key scrolls a view `height` pixels high (down
 * for positive), or null for a key that doesn't scroll
 */
export const scrollBy = (
  key: string,
  shift: boolean,
  height: number,
): number | null => {
  const line = 40;
  const view = Math.max(line, height - line);
  switch (key) {
    case "ArrowDown":
      return line;
    case "ArrowUp":
      return -line;
    case "PageDown":
      return view;
    case "PageUp":
      return -view;
    case " ":
      return shift ? -view : view;
    case "Home":
      return -Infinity;
    case "End":
      return Infinity;
    default:
      return null;
  }
};
