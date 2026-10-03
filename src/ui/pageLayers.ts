import type { PageDisplay, PageEngine } from "../engine/engine";
import type { PageLayoutState } from "../state";

// The two layers of a painted page: its text (the body) and its header and
// footer (the bands), which the engine versions apart (see .claude/rules/layout-engine.md), so a
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
 * layerVersions returns the versions of each page's body and bands
 */
export const layerVersions = (
  state: PageLayoutState,
): Record<Layer, Uint32Array> => ({
  body: state.bodyVersions,
  bands: state.bandVersions,
});

// the colours a theme paints the pages in: its text, the selection, and the
// selected text over it
export interface ThemeColors {
  text: string;
  selection: string;
  selectedText: string;
}

// read once for each theme, for every page, since reading them makes the
// webview compute the styles
const colors = new Map<string, ThemeColors>();

/**
 * themeColors returns the colours of `theme`, as `element` inherits them
 * from the theme's variables (src/scss/themes/)
 */
export const themeColors = (theme: string, element: Element): ThemeColors => {
  let known = colors.get(theme);
  if (!known) {
    const style = getComputedStyle(element);
    known = {
      text: style.color,
      selection: style.getPropertyValue("--selection-color").trim(),
      selectedText: style.getPropertyValue("--selection-text-color").trim(),
    };
    colors.set(theme, known);
  }
  return known;
};

// how often the page frames rendered again, see PageFrame.vue
export const frameRenders = { count: 0 };
