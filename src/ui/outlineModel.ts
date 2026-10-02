import { frameLayout } from "../engine/frames";
import {
  MIN_HEADINGS,
  OUTLINE_BREAKPOINT,
  type PageLayoutState,
  type PageViewMode,
} from "../state";

// Where the outline (DocumentOutline.vue) shows; which heading it marks is
// in readingLine.ts, and how it looks in main.scss.

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

/**
 * freeRight returns the room right of the text while the outline takes none
 * @param width the width the pages are laid out at: the window's, without
 * the page view's scrollbar
 * @param engineless whether the editor shows the text itself
 */
export const freeRight = (
  width: number,
  state: PageLayoutState | null,
  mode: PageViewMode,
  engineless: boolean,
) => {
  if (engineless) return width - Math.min(width, FALLBACK_TEXT_WIDTH);
  if (!state) return 0;
  // every frame is as wide and as far left as the first
  const frame = frameLayout(state, mode, width).frames[0];
  return frame ? width - (frame.left + frame.width) : 0;
};

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

/**
 * wheelPixels returns how far a wheel turn scrolls, in pixels
 * @param viewHeight the height of what scrolls, for a turn by pages
 */
export const wheelPixels = (
  { deltaY, deltaMode }: Pick<WheelEvent, "deltaY" | "deltaMode">,
  viewHeight: number,
) =>
  deltaMode === 1
    ? deltaY * 16
    : deltaMode === 2
      ? deltaY * viewHeight
      : deltaY;
