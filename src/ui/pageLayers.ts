import type { PageDisplay, PageEngine } from "../engine/engine";
import type { PageLayoutState } from "../state";

// The two layers of a painted page: its text (the body) and its header and
// footer (the bands), which the engine versions apart (S6 in SEAM.md), so a
// change of one paints only that layer, e.g. {pages} in every footer when a
// page is added.

export type Layer = "body" | "bands";

/**
 * layerDisplay returns what one layer of a page shows, read again only when
 * its version changed
 */
export const layerDisplay = (
  engine: PageEngine,
  layer: Layer,
  page: number,
  version: number,
): PageDisplay =>
  layer === "body"
    ? engine.bodyDisplay(page, version)
    : engine.bandDisplay(page, version);

/**
 * layerVersions returns the versions of each page's body and bands, or the
 * combined ones of a layout published without them
 */
export const layerVersions = (
  state: PageLayoutState,
): Record<Layer, Uint32Array> => ({
  body: state.bodyVersions ?? state.versions,
  bands: state.bandVersions ?? state.versions,
});

// how often the page frames rendered again, see PageFrame.vue
export const frameRenders = { count: 0 };
