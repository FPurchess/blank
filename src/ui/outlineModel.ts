import {
  MIN_HEADINGS,
  OUTLINE_BREAKPOINT,
  type OutlinePeek,
  type PageLayoutState,
  viewFrames,
} from "../state";

// Where the outline (DocumentOutline.vue) shows; which heading it marks is
// in src/readingLine.ts, and how it looks in main.scss.

// the room the open list takes when it can't lie beside the pages: its
// width and the gap to the text, $outline-dock in main.scss
export const OUTLINE_DOCK = 280;
// the widest the editor shows the text without the engine (#editor in
// main.scss), left aligned
export const FALLBACK_TEXT_WIDTH = 1200;

// hidden: too few headings; dashes: the dashes at the right edge, which open
// the list floating over the pages; beside: the list open in the room right
// of the pages; docked: the list open in room the pages give up for it
export type OutlinePlacement = "hidden" | "dashes" | "beside" | "docked";

// how the list shows: open beside the pages (a side pane), floating over
// them after a click or the shortcut on a narrow window (a side pane with a
// shadow), or peeking while the pointer is on the dashes (a popover)
export type OutlineShape = "open" | "floating" | "peek";

/**
 * listShape returns how the list shows
 * @param open whether it's open beside the pages (beside or docked)
 * @param peek what opened it over the pages: the pointer or a click
 */
export const listShape = (open: boolean, peek: OutlinePeek): OutlineShape =>
  open ? "open" : peek === "sticky" ? "floating" : "peek";

/**
 * freeRight returns the room right of the text while the outline takes none
 * @param width the width the pages are laid out at: the window's, without
 * the page view's scrollbar
 * @param engineless whether the editor shows the text itself
 */
export const freeRight = (
  width: number,
  state: PageLayoutState | null,
  engineless: boolean,
) => {
  if (engineless) return width - Math.min(width, FALLBACK_TEXT_WIDTH);
  if (!state) return 0;
  // every frame is as wide and as far left as the first, in the view chosen;
  // at Fit, so zooming in, which scrolls the pages across, doesn't dock it
  const frame = viewFrames(state, width, "fit").frames[0];
  return frame ? width - (frame.left + frame.width) : 0;
};

/**
 * layoutWidth returns the width the pages are laid out at while the outline
 * takes no room: the window's, without the page view's scrollbar and the
 * room a pane docked at the left of the pages takes (see blocksDock)
 */
export const layoutWidth = (
  windowWidth: number,
  scrollbar: number,
  leftDock: number,
) => windowWidth - scrollbar - leftDock;

/**
 * outlinePlacement returns where the outline shows
 * @param count how many headings it lists
 * @param pinned whether the user keeps it open
 * @param windowWidth the window's width
 * @param free the room right of the text (see freeRight)
 */
export const outlinePlacement = (
  count: number,
  pinned: boolean,
  windowWidth: number,
  free: number,
): OutlinePlacement => {
  if (count < MIN_HEADINGS) return "hidden";
  if (!pinned || windowWidth < OUTLINE_BREAKPOINT) return "dashes";
  return free >= OUTLINE_DOCK ? "beside" : "docked";
};
