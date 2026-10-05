import { CommandIdentifier } from "../config";
import { deskToWindow, framesNow } from "../engine/geometry";
import { type Band, hasText, variantsOf } from "../layout/bands";
import { FIELD_NAMES } from "../layout/placeholders";
import type { PageSettings } from "../layout/settings";
import type { Field } from "../layout/tokens";
import { pageLayoutState, type PageScrollRequest } from "../state";
import { bandPlace, type Rect } from "./pageViewModel";

// What the header and footer strip (BandEditor.vue) and the bands on the
// pages (BandTarget.vue) show besides the strip itself, which is
// bandStrip.ts, and where they go.

export const BANDS: Band[] = ["header", "footer"];

// what a placeholder is called in its insert button's tooltip
const INSERT_NAMES: Partial<Record<Field, string>> = { file: "file name" };

// the placeholders the open strip inserts, see tokens.ts, by the names the
// pages show where one comes out empty
export const INSERTS = (
  ["title", "author", "chapter", "date", "file"] as const
).map((field) => ({
  label: FIELD_NAMES[field],
  tip: `Insert the ${INSERT_NAMES[field] ?? field}`,
  text: `{${field}}`,
}));

/**
 * shownAtRest returns the band a document has: that of every page, or else
 * of the first or even pages, undefined where there is none
 */
export const shownAtRest = (settings: PageSettings, band: Band) =>
  variantsOf(settings)
    .map((bands) => bands[band])
    .find(hasText);

/**
 * bandCommand returns the command that opens the strip of `band`
 */
export const bandCommand = (band: Band) =>
  band === "header"
    ? CommandIdentifier.EDIT_HEADER
    : CommandIdentifier.EDIT_FOOTER;

/**
 * bandInWindow returns where the page view shows a page's header or footer
 * in the window, its sheet, and the view; null while no pages show. It
 * follows the scrolling, the window's size and the zoom.
 * @param page the page, counted from 0
 */
export const bandInWindow = (page: number, band: Band) => {
  const shown = framesNow();
  const state = pageLayoutState.value;
  if (!shown || !state) return null;
  const placed = bandPlace(shown.frames, page, band, state);
  if (!placed) return null;
  const { viewport } = shown;
  return {
    sheet: deskToWindow(viewport, placed.sheet),
    band: deskToWindow(viewport, placed.band),
    view: {
      left: viewport.left,
      top: viewport.top,
      width: viewport.width,
      height: viewport.height,
    },
  };
};

/**
 * fitsInView returns whether a band and its strip both show in the view
 * where they are: the strip below a header, above a footer
 * @param height the strip's height, with its gap to the band
 */
export const fitsInView = (
  band: Rect,
  which: Band,
  view: Rect,
  height: number,
) => {
  const above = which === "footer" ? height : 0;
  const below = which === "header" ? height : 0;
  return (
    band.top - above >= view.top &&
    band.top + band.height + below <= view.top + view.height
  );
};

/**
 * centerRequest returns the request that scrolls the page view so that a
 * page's band is in the middle of the view; null while no pages show
 * @param page the page, counted from 0
 */
export const centerRequest = (
  page: number,
  band: Band,
): PageScrollRequest | null => {
  const shown = framesNow();
  const state = pageLayoutState.value;
  if (!shown || !state) return null;
  const { frames, viewport } = shown;
  const placed = bandPlace(frames, page, band, state);
  const frame = frames.frames[page];
  if (!placed || !frame) return null;
  return {
    page,
    x: 0,
    // where the band starts, in the page's points, also above or below it
    y: frame.y + (placed.band.top - frame.top) / frames.scale,
    width: 0,
    height: 0,
    at: Math.max(0, (viewport.height - placed.band.height) / 2),
  };
};
