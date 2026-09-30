import { computed, shallowRef } from "vue";

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
  // changes when what a page shows changes, so only those pages are
  // painted again
  versions: Uint32Array;
  // the versions of each page's text and of its header and footer, which change apart (see SEAM.md)
  bodyVersions?: Uint32Array;
  bandVersions?: Uint32Array;
  // where the text of each page ends, from its top edge
  bottoms: Float32Array;
  // whether the line with the document's properties shows above the first
  // page (see src/ui/PageProperties.vue), which takes room there
  properties?: boolean;
  // whether the first page has header text, which "page ends" shows in the
  // room above its first frame
  header?: boolean;
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

// the selection's rectangles, empty while it is a caret: the text of a
// range, or the selected cells
export const pageSelection = shallowRef<PageRect[]>([]);

// the boxes of the selected node, e.g. an image, a rule or a page break,
// which the page view outlines; empty for any other selection
export const pageNodeSelection = shallowRef<PageRect[]>([]);

// the text being composed with an input method, which the page view
// underlines; empty while nothing is composed
export const pageComposition = shallowRef<PageRect[]>([]);

// the page the selection's head is on, counted from 1, and how many there
// are, for "Page N of M"
export const pagePosition = computed(() => {
  const layout = pageLayoutState.value;
  if (!layout) return null;
  const head =
    pageCaret.value?.page ??
    pageSelection.value[pageSelection.value.length - 1]?.page ??
    pageNodeSelection.value[0]?.page ??
    0;
  return { page: head + 1, pages: layout.pages };
});

// asks the page view to bring a spot into view, e.g. the selection's head
// after a key moved it; with `at`, to show it that many pixels below the top
// of the view, e.g. for Page Down. A new object each time.
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
