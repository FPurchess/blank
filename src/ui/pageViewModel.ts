import type { PageLayoutState, PageRect, PageViewMode } from "../state";

// Where the page view puts each page, in both views: a frame is the part of
// a page that is shown, placed on the desk (the scrolled content), in CSS
// pixels. "pages" shows each whole sheet; "page ends" shows the text of each
// page one after the other, with a mark where a page ends.

// room above the first and below the last page, for the bars
export const VIEW_TOP = 56;
export const VIEW_BOTTOM = 72;
// between the sheets, and around them
export const SHEET_GAP = 24;
export const DESK_SIDE = 24;
// the mark between the pages of "page ends"
export const MARK_HEIGHT = 64;
// what "page ends" shows beside the text, for list markers and quote bars,
// in points
export const BLEED = 24;
// 11 pt body text at the editor's 18 px
export const TEXT_SCALE = 18 / 11;
// sheets at most at the size they print, at 96 dpi
export const SHEET_SCALE = 96 / 72;
// the least room a page's text takes in "page ends", one line
const MIN_TEXT = 16;

export interface Frame {
  page: number;
  // on the desk, in CSS pixels
  top: number;
  left: number;
  width: number;
  height: number;
  // the part of the page shown, in points from its top left corner
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FrameLayout {
  mode: PageViewMode;
  // CSS pixels per point
  scale: number;
  frames: Frame[];
  // the desk's height
  height: number;
}

/**
 * frameLayout places the pages of `layout` for a view `width` pixels wide
 */
export const frameLayout = (
  layout: PageLayoutState,
  mode: PageViewMode,
  width: number,
): FrameLayout => {
  const frames: Frame[] = [];
  if (mode === "pages") {
    const scale = Math.max(
      0.2,
      Math.min(SHEET_SCALE, (width - 2 * DESK_SIDE) / layout.width),
    );
    const sheetWidth = layout.width * scale;
    const sheetHeight = layout.height * scale;
    const left = Math.max(DESK_SIDE, (width - sheetWidth) / 2);
    for (let page = 0; page < layout.pages; page++) {
      frames.push({
        page,
        top: VIEW_TOP + page * (sheetHeight + SHEET_GAP),
        left,
        width: sheetWidth,
        height: sheetHeight,
        x: 0,
        y: 0,
        w: layout.width,
        h: layout.height,
      });
    }
    const height =
      VIEW_TOP +
      layout.pages * (sheetHeight + SHEET_GAP) -
      SHEET_GAP +
      VIEW_BOTTOM;
    return { mode, scale, frames, height };
  }
  const { margins } = layout;
  const shown = layout.width - margins.left - margins.right + 2 * BLEED;
  const scale = Math.max(
    0.2,
    Math.min(TEXT_SCALE, (width - 2 * DESK_SIDE) / shown),
  );
  const left = Math.max(DESK_SIDE / 2, (width - shown * scale) / 2);
  let top = VIEW_TOP;
  for (let page = 0; page < layout.pages; page++) {
    const bottom = Math.max(layout.bottoms[page] ?? 0, margins.top + MIN_TEXT);
    const h = bottom - margins.top;
    frames.push({
      page,
      top,
      left,
      width: shown * scale,
      height: h * scale,
      x: margins.left - BLEED,
      y: margins.top,
      w: shown,
      h,
    });
    top += h * scale + MARK_HEIGHT;
  }
  return { mode, scale, frames, height: top - MARK_HEIGHT + VIEW_BOTTOM };
};

/**
 * visibleFrames returns the frames within `overscan` pixels of the part of
 * the desk from `top` that is `height` pixels high
 */
export const visibleFrames = (
  layout: FrameLayout,
  top: number,
  height: number,
  overscan = height,
) =>
  layout.frames.filter(
    (frame) =>
      frame.top + frame.height >= top - overscan &&
      frame.top <= top + height + overscan,
  );

/**
 * frameNear returns the frame at a height of the desk, or the nearest one
 */
export const frameNear = (layout: FrameLayout, y: number): Frame | null => {
  let best: Frame | null = null;
  let distance = Infinity;
  for (const frame of layout.frames) {
    const away =
      y < frame.top ? frame.top - y : Math.max(0, y - frame.top - frame.height);
    if (away < distance) {
      best = frame;
      distance = away;
    }
    if (frame.top > y) break;
  }
  return best;
};

/**
 * pointOnPage returns the page and the point on it, in points, under a
 * point of the desk, in pixels
 */
export const pointOnPage = (layout: FrameLayout, x: number, y: number) => {
  const frame = frameNear(layout, y);
  if (!frame) return null;
  return {
    page: frame.page,
    x: frame.x + (x - frame.left) / layout.scale,
    y: frame.y + (y - frame.top) / layout.scale,
  };
};

/**
 * onDesk returns where a spot of a page is on the desk, in pixels, or null
 * for a page that isn't laid out
 */
export const onDesk = (layout: FrameLayout, rect: PageRect) => {
  const frame = layout.frames[rect.page];
  if (!frame) return null;
  return {
    left: frame.left + (rect.x - frame.x) * layout.scale,
    top: frame.top + (rect.y - frame.y) * layout.scale,
    width: rect.width * layout.scale,
    height: rect.height * layout.scale,
  };
};

/**
 * scrollFor returns where to scroll so that `rect`, on the desk, is in the
 * view from `top` that is `height` high, or null if it already is
 * @param room the space to keep above and below it
 */
export const scrollFor = (
  rect: { top: number; height: number },
  top: number,
  height: number,
  room = 64,
) => {
  if (rect.top - room < top) return Math.max(0, rect.top - room);
  if (rect.top + rect.height + room > top + height) {
    return rect.top + rect.height + room - height;
  }
  return null;
};

/**
 * endMark returns what the mark at the end of a page shows: its footer,
 * with its number when the footer has none, and the next page's header
 * @param bands the band texts of the page and of the next, see
 *   PageEngine.bands
 */
export const endMark = (
  page: number,
  bands: string[],
  next: string[] | null,
) => {
  const footer = bands.slice(3, 6);
  const number = String(page + 1);
  const hasNumber = footer.some((slot) => slot.includes(number));
  return {
    footer,
    number: hasNumber ? "" : `${page + 1}`,
    header: next ? next.slice(0, 3) : ["", "", ""],
  };
};
