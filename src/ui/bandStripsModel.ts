import { CommandIdentifier } from "../config";
import { editBand } from "../editor/commands/editBand";
import type { EditorHandle } from "../editor/handle";
import { pageEngine } from "../engine/engine";
import { deskToWindow, framesNow } from "../engine/geometry";
import { type Band, hasText, variantsOf } from "../layout/bands";
import {
  FIELD_FULL_NAMES,
  FIELD_NAMES,
  pageBandParts,
} from "../layout/placeholders";
import type { PageSettings } from "../layout/settings";
import {
  pageFields,
  pageLayout,
  pageLayoutState,
  type PageScrollRequest,
} from "../state";
import { bandPlace } from "./pageViewModel";

// What the header or footer being edited (BandEditor.vue) and the bands on
// the pages (BandTarget.vue) show besides the strip itself, which is
// bandStrip.ts, and where they are.

// the placeholders the open strip inserts, see tokens.ts, by the names the
// pages show where one comes out empty
export const INSERTS = (
  ["title", "author", "chapter", "date", "file"] as const
).map((field) => ({
  label: FIELD_NAMES[field],
  tip: `Insert the ${FIELD_FULL_NAMES[field].toLowerCase()}`,
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
 * addsBand returns whether the pages offer to add a header or footer: while
 * the document has none at all
 */
export const addsBand = (band: Band) =>
  shownAtRest(pageLayout.value.settings, band) === undefined;

/**
 * bandCommand returns the command that opens the strip of `band`
 */
export const bandCommand = (band: Band) =>
  band === "header"
    ? CommandIdentifier.EDIT_HEADER
    : CommandIdentifier.EDIT_FOOTER;

/**
 * openBandOn opens a page's header or footer for editing, as a click on it
 * does, leaving the focus to its slots
 * @param page the page, counted from 0
 */
export const openBandOn = (editor: EditorHandle, band: Band, page: number) =>
  editor.run(editBand(band, page + 1), { focus: false });

/**
 * pageBands returns what the six slots of a page's header and footer show
 * on the screen, with the placeholders that come out empty named (see
 * src/layout/placeholders.ts); null without the layout engine
 * @param page the page, counted from 0
 * @param pages how many there are, which a component keeps in a computed,
 *   so typing, which lays out anew, doesn't read the bands again
 */
export const pageBands = (page: number, pages: number) => {
  const engine = pageEngine;
  if (!engine) return null;
  return pageBandParts(
    pageLayout.value.layout,
    page,
    pages,
    pageFields.value,
    engine.bands(page),
  );
};

// where the page view shows a page's band and its sheet on the desk, with
// the view; null while no pages show
const placedNow = (page: number, band: Band) => {
  const shown = framesNow();
  const state = pageLayoutState.value;
  if (!shown || !state) return null;
  const placed = bandPlace(shown.frames, page, band, state);
  return placed && { ...shown, placed };
};

/**
 * bandInWindow returns where the page view shows a page's header or footer
 * in the window, its sheet, and the view; null while no pages show. It
 * follows the scrolling, the window's size and the zoom.
 * @param page the page, counted from 0
 */
export const bandInWindow = (page: number, band: Band) => {
  const now = placedNow(page, band);
  if (!now) return null;
  const { viewport, placed } = now;
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
 * centerRequest returns the request that scrolls the page view so that a
 * page's band is in the middle of the view; null while no pages show
 * @param page the page, counted from 0
 */
export const centerRequest = (
  page: number,
  band: Band,
): PageScrollRequest | null => {
  const now = placedNow(page, band);
  const frame = now?.frames.frames[page];
  if (!now || !frame) return null;
  const { frames, viewport, placed } = now;
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
