import type {
  PageLayoutState,
  PageRect,
  PageViewMode,
} from "../state/pageView";

// Where the page view puts each page, in both views: a frame is the part of
// a page that is shown, placed on the desk (the scrolled content), in CSS
// pixels. The geometry (geometry.ts) and the page view (src/ui/PageView.vue)
// both place the pages with it. "pages" shows each whole sheet; "page ends" shows the text of each
// page one after the other, with a mark where a page ends.

// room above the first and below the last page, for the bars
export const VIEW_TOP = 56;
// more room above the first page for the line with the document's
// properties
export const PROPERTIES_ROOM = 28;
// room above the first page's text in "page ends" for its header, between
// the properties' room and the first frame
export const HEADER_ROOM = 20;
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

/**
 * snapped returns a frame on whole pixels, so its canvas isn't shown between
 * the device's pixels, which would blur it
 */
const snapped = (frame: Frame): Frame => {
  const left = Math.round(frame.left);
  const top = Math.round(frame.top);
  return {
    ...frame,
    left,
    top,
    width: Math.round(frame.left + frame.width) - left,
    height: Math.round(frame.top + frame.height) - top,
  };
};

export interface FrameLayout {
  mode: PageViewMode;
  // CSS pixels per point
  scale: number;
  frames: Frame[];
  // the desk's height
  height: number;
  // the room above the first frame for the first page's header, in "page
  // ends"; 0 in "pages", whose sheets show their headers
  headerRoom: number;
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
  const viewTop = VIEW_TOP + (layout.properties ? PROPERTIES_ROOM : 0);
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
        top: viewTop + page * (sheetHeight + SHEET_GAP),
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
      viewTop +
      layout.pages * (sheetHeight + SHEET_GAP) -
      SHEET_GAP +
      VIEW_BOTTOM;
    return { mode, scale, frames: frames.map(snapped), height, headerRoom: 0 };
  }
  const { margins } = layout;
  const shown = layout.width - margins.left - margins.right + 2 * BLEED;
  const scale = Math.max(
    0.2,
    Math.min(TEXT_SCALE, (width - 2 * DESK_SIDE) / shown),
  );
  const left = Math.max(DESK_SIDE / 2, (width - shown * scale) / 2);
  const headerRoom = layout.header ? HEADER_ROOM : 0;
  let top = viewTop + headerRoom;
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
  return {
    mode,
    scale,
    frames: frames.map(snapped),
    height: top - MARK_HEIGHT + VIEW_BOTTOM,
    headerRoom,
  };
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
 * visibleRange returns the first and last page whose frames are within
 * `overscan` pixels of the part of the desk from `top` that is `height`
 * pixels high, as a string, e.g. "3-5", so what depends on it changes only
 * when the pages change; "" for none
 */
export const visibleRange = (
  layout: FrameLayout,
  top: number,
  height: number,
  overscan = height,
) => {
  const { frames } = layout;
  const from = top - overscan;
  const to = top + height + overscan;
  // the first frame that ends below `from`, by bisection: the frames are in
  // order down the desk
  let low = 0;
  let high = frames.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (frames[middle].top + frames[middle].height < from) low = middle + 1;
    else high = middle;
  }
  let last = low - 1;
  while (last + 1 < frames.length && frames[last + 1].top <= to) last++;
  return last < low ? "" : `${low}-${last}`;
};

/**
 * keptRange returns the pages to keep shown: those `near` the view, and
 * those shown before that are still within `far`, so a page isn't dropped
 * and shown again while the view moves back and forth over its edge
 * @param shown the pages shown before, near and far as from visibleRange
 */
export const keptRange = (shown: string, near: string, far: string) => {
  if (!near || !shown || !far) return near;
  const [nearFirst, nearLast] = near.split("-").map(Number);
  const [shownFirst, shownLast] = shown.split("-").map(Number);
  const [farFirst, farLast] = far.split("-").map(Number);
  // what was shown and is still within reach
  const keptFirst = Math.max(shownFirst, farFirst);
  const keptLast = Math.min(shownLast, farLast);
  if (keptFirst > keptLast) return near;
  return `${Math.min(nearFirst, keptFirst)}-${Math.max(nearLast, keptLast)}`;
};

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
