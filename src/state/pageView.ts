import { shallowRef } from "vue";

import { frameLayout, viewAnchor, type ViewAnchor } from "../engine/frames";

// The page view, which the layout engine paints (see src/engine and
// src/ui/PageView.vue): the view the user chose, and what the engine laid
// out, published by the editor's pageView plugin.

// "page-ends": one column at the page's text width, with a mark where each
// page ends; "pages": the sheets themselves, on a desk
export type PageViewMode = "page-ends" | "pages";
export const PAGE_VIEW_MODES: PageViewMode[] = ["page-ends", "pages"];

// the view the user chose, kept across restarts (see storage.ts)
export const pageView = shallowRef<PageViewMode>("page-ends");

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
}

export const pageViewport = shallowRef<PageViewport | null>(null);

/**
 * currentViewAnchor returns the spot of the pages at the top of the view, to
 * come back to it later, e.g. when the tab is shown again; null at the top or
 * without pages
 */
export const currentViewAnchor = (): ViewAnchor | null => {
  const layout = pageLayoutState.value;
  const viewport = pageViewport.value;
  if (!layout || !viewport) return null;
  return viewAnchor(
    frameLayout(layout, pageView.value, viewport.width),
    viewport.scrollTop,
  );
};
