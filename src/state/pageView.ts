import { computed, shallowRef } from "vue";

import {
  frameLayout,
  SHEET_SCALE,
  viewAnchor,
  type ViewAnchor,
} from "../engine/frames";

// The page view, which the layout engine paints (see src/engine and
// src/ui/PageView.vue): the view the user chose, and what the engine laid
// out, published by the editor's pageView plugin.

// "page-ends": one column at the page's text width, with a mark where each
// page ends; "pages": the sheets themselves, on a desk
export type PageViewMode = "page-ends" | "pages";
export const PAGE_VIEW_MODES: PageViewMode[] = ["page-ends", "pages"];

// the view the user chose, kept across restarts (see storage.ts)
export const pageView = shallowRef<PageViewMode>("page-ends");

// how large the pages show: "fit" as wide as the view allows, or a share of
// the size they print at (1 is 100 %), the same in both views; for the
// window, not per tab, kept across restarts (see storage.ts)
export type PageZoom = "fit" | number;
export const ZOOM_STEPS: readonly number[] = [
  0.5, 0.67, 0.75, 0.8, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2,
];
export const pageZoom = shallowRef<PageZoom>("fit");
export const isPageZoom = (value: unknown): value is PageZoom =>
  value === "fit" || ZOOM_STEPS.includes(value as number);

// what the zoom commands say without the engine, which shows no pages
export const ZOOM_NEEDS_PAGES = "Zoom needs the page layout";

/**
 * zoomLabel returns how the status bar and the main menu show the zoom: its
 * text, e.g. "Fit" or "125%", the tooltip of the button that sets Fit, and
 * its name for screen readers, also what the zoom commands announce
 * @param factor the share of the printed size the pages are at, Fit's too
 */
export const zoomLabel = (zoom: PageZoom, factor: number) => {
  const percent = `${Math.round(factor * 100)}%`;
  return zoom === "fit"
    ? {
        text: "Fit",
        tip: `Fit to window (${percent})`,
        spoken: `Fit, ${percent}`,
      }
    : { text: percent, tip: "Fit to window", spoken: percent };
};

// a spot on a page that stays where it is in the view while the zoom
// changes, e.g. the one under the pointer; set right before the zoom, and
// cleared by the page view once it scrolled to it
export interface ZoomAnchor {
  page: number;
  // on the page, in points
  x: number;
  y: number;
  // in the view, in pixels from its top left corner
  viewX: number;
  viewY: number;
}
export const zoomAnchor = shallowRef<ZoomAnchor | null>(null);

// the pages as laid out, replaced whenever a page changes
export interface PageLayoutState {
  // the page, in points
  width: number;
  height: number;
  margins: { top: number; right: number; bottom: number; left: number };
  pages: number;
  // the versions of each page's text and of its header and footer, which
  // change only when what they show changes, and apart, so only those are
  // painted again (see .claude/rules/layout-engine.md)
  bodyVersions: Uint32Array;
  bandVersions: Uint32Array;
  // where the text of each page ends, from its top edge
  bottoms: Float32Array;
  // whether the first page has header text, which "page ends" shows in the
  // room above its first frame
  header?: boolean;
  // whether the last page has footer text, which "page ends" shows in the
  // room below its frame
  footer?: boolean;
}

// null until the engine laid out the document
export const pageLayoutState = shallowRef<PageLayoutState | null>(null);

// a spot on a page, in points from its top left corner
export interface PageRect {
  page: number;
  x: number;
  y: number;
  width: number;
  height: number;
}

// the caret, null while the selection isn't empty or a node is selected
export const pageCaret = shallowRef<PageRect | null>(null);

// where the selection's head is painted, with its line's affinity (see .claude/rules/layout-engine.md), e.g. for the input method's window; null without pages
export const pageHeadBox = shallowRef<PageRect | null>(null);

// the selection's rectangles, empty while it is a caret: the text of a
// range, or the selected cells
export const pageSelection = shallowRef<PageRect[]>([]);

// the boxes of the selected node, e.g. an image, a rule or a page break,
// which the page view outlines; empty for any other selection
export const pageNodeSelection = shallowRef<PageRect[]>([]);

// the text being composed with an input method, which the page view
// underlines; empty while nothing is composed
export const pageComposition = shallowRef<PageRect[]>([]);

// where dragged text would drop, which the page view paints as a caret;
// null while no text is dragged
export const pageDropCaret = shallowRef<PageRect | null>(null);

// where a dragged block would drop, a place between two blocks at the top of
// the document, which src/ui/BlockMarks.vue shows as a line; null while no
// block is dragged
export const pageDropGap = shallowRef<number | null>(null);

// the content block under the pointer, which the page view outlines with a
// hairline: where it starts and ends; null while there is none
export const pageHoverBlock = shallowRef<{ from: number; to: number } | null>(
  null,
);

// true once the editor shows the text itself, without the layout engine (see useFallbackEditor)
export const engineMissing = shallowRef(false);

// asks the page view to bring a spot into view, e.g. the selection's head
// after a key moved it; with `at`, to show it that many pixels below the top
// of the view, e.g. for Page Down. A new object each time, which the page
// view clears once it brought it into view.
export type PageScrollRequest = PageRect & { at?: number };
export const pageScrollRequest = shallowRef<PageScrollRequest | null>(null);

// where the page view shows the pages: its box in the window and how far it
// is scrolled, written by src/ui/PageView.vue whenever it scrolls or
// resizes, and null while it isn't shown. The geometry (src/engine/
// geometry.ts) measures with it, and plugins watch it to place what they
// show again.
export interface PageViewport {
  left: number;
  top: number;
  width: number;
  height: number;
  scrollTop: number;
  // how far it scrolled across, when the zoom shows the pages wider than it
  scrollLeft: number;
}

export const pageViewport = shallowRef<PageViewport | null>(null);

/**
 * viewFrames places the pages of `state` in a view `width` pixels wide, in
 * the view and at the zoom chosen: where every place the pages are shown
 * comes from (see .claude/rules/layout-engine.md, "Zoom")
 */
export const viewFrames = (state: PageLayoutState, width: number) =>
  frameLayout(state, pageView.value, width, pageZoom.value);

// the page view's width alone, which notifies only when it changes, not on
// every scroll as pageViewport does
const viewWidth = computed(() => pageViewport.value?.width ?? null);

// where the page view shows the pages, worked out again when the layout, the
// view's width, the view or the zoom change, not on every scroll; null while
// it isn't shown or nothing is laid out
export const deskLayout = computed(() => {
  const state = pageLayoutState.value;
  const width = viewWidth.value;
  return state && width !== null ? viewFrames(state, width) : null;
});

// the share of the printed size the pages show at, e.g. 1.25, or 0.87 on
// Fit as wide as the view allows (1 before anything is laid out)
export const zoomFactor = computed(() =>
  pageZoom.value === "fit"
    ? (deskLayout.value?.scale ?? SHEET_SCALE) / SHEET_SCALE
    : pageZoom.value,
);

/**
 * currentViewAnchor returns the spot of the pages at the top of the view, to
 * come back to it later, e.g. when the tab is shown again; null at the top or
 * without pages
 */
export const currentViewAnchor = (): ViewAnchor | null => {
  const layout = deskLayout.value;
  const viewport = pageViewport.value;
  if (!layout || !viewport) return null;
  return viewAnchor(layout, viewport.scrollTop);
};
