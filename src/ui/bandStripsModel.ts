import { BAND_HEIGHT, STATUS_HEIGHT, TOP_BAR_HEIGHT } from "../chrome";
import { CommandIdentifier } from "../config";
import { type Band, hasText, variantsOf } from "../layout/bands";
import { FIELD_NAMES } from "../layout/placeholders";
import type { PageSettings } from "../layout/settings";

// What the header and footer strips (BandStrips.vue, BandEdge.vue,
// BandEditor.vue) show besides the strip itself, which is bandStrip.ts.

export const BANDS: Band[] = ["header", "footer"];

// the placeholders the open strip inserts, see tokens.ts, by the names the
// pages show where one comes out empty
export const INSERTS = (
  ["title", "author", "chapter", "date", "file"] as const
).map((field) => ({ label: FIELD_NAMES[field], text: `{${field}}` }));

// where the mouse shows the hints to add a band: just below the top area,
// where the hint shows, and on the status bar or the hint just above it
export const NEAR_TOP = TOP_BAR_HEIGHT + BAND_HEIGHT;
export const NEAR_BOTTOM = STATUS_HEIGHT + BAND_HEIGHT;

// the status bar's controls and the word count's card, over which the hint
// at the bottom stays away: it's for the bar's empty room and just above it
export const BAR_CONTROLS = ".status-item, #ui-language, #word-count-card";

/**
 * nearEdge returns the edge whose hint the mouse at `y` shows, in a window
 * `height` high: the top one just below the top area (never on its tabs and
 * buttons), the bottom one on the status bar or just above it, unless it's on
 * one of the bar's controls
 */
export const nearEdge = (y: number, height: number, onControl: boolean) =>
  y >= TOP_BAR_HEIGHT && y < NEAR_TOP
    ? "top"
    : y > height - NEAR_BOTTOM && !onControl
      ? "bottom"
      : null;

/**
 * shownAtRest returns the band to show at an edge: that of every page, or
 * else of the first or even pages, undefined where there is none
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
