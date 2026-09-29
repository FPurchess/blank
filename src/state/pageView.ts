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
  // where the text of each page ends, from its top edge
  bottoms: Float32Array;
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

// the selection's rectangles, empty while it is a caret
export const pageSelection = shallowRef<PageRect[]>([]);

// the page the selection's head is on, counted from 1, and how many there
// are, for "Page N of M"
export const pagePosition = computed(() => {
  const layout = pageLayoutState.value;
  if (!layout) return null;
  const head =
    pageCaret.value?.page ??
    pageSelection.value[pageSelection.value.length - 1]?.page ??
    0;
  return { page: head + 1, pages: layout.pages };
});

// asks the page view to bring the selection's head into view, e.g. after a
// key moved it; a new object each time
export const pageScrollRequest = shallowRef<PageRect | null>(null);
