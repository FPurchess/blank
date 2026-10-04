import { CommandIdentifier, getKeyBinding } from "../config";
import { formatShortcut } from "../editor/keyBindings";
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

// how near the top or bottom of the window the mouse shows the hints to add
// a band: the height of the bars, $bar-height in main.scss
export const NEAR_EDGE = 44;

/**
 * shownAtRest returns the band to show at an edge: that of every page, or
 * else of the first or even pages, undefined where there is none
 */
export const shownAtRest = (settings: PageSettings, band: Band) =>
  variantsOf(settings)
    .map((bands) => bands[band])
    .find(hasText);

/**
 * editBandShortcut returns the shortcut that opens the strip of `band`, as
 * the tooltips show it
 */
export const editBandShortcut = (band: Band) =>
  formatShortcut(
    getKeyBinding(
      band === "header"
        ? CommandIdentifier.EDIT_HEADER
        : CommandIdentifier.EDIT_FOOTER,
    ),
  );
