import { CommandIdentifier, getKeyBinding } from "../config";
import { formatShortcut } from "../editor/keyBindings";
import { BLEED, type FrameLayout, PROPERTIES_ROOM } from "../engine/frames";
import { type Band, bandsOn, formatNumber, pageNumber } from "../layout/bands";
import type { Layout } from "../layout/resolve";
import { SLOTS } from "../layout/settings";
import { segments } from "../layout/tokens";

// What the page view shows besides the pages, see src/engine/frames.ts for
// where they are.

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
 * endMark returns what the mark between a page and the next shows: its
 * footer, with its number when the footer doesn't show it, and the next
 * page's header
 * @param page the page, counted from 0
 * @param bands the band texts of the page, and `next` those of the next, see
 *   PageEngine.bands
 * @param layout the document's page setup, which numbers the pages
 */
export const endMark = (
  page: number,
  bands: string[],
  next: string[],
  layout: Layout,
) => {
  // the footer's settings say whether it shows the number, whatever its
  // text reads, e.g. "Chapter 2" on page 2
  const footer = bandsOn(layout, page + 1).footer;
  const shown = SLOTS.some((slot) =>
    segments(footer[slot]).some(
      (segment) => typeof segment !== "string" && segment.field === "page",
    ),
  );
  return {
    footer: bands.slice(3, 6),
    number: shown
      ? ""
      : formatNumber(pageNumber(layout, page + 1), layout.numberStyle),
    header: next.slice(0, 3),
  };
};

// in "page ends" a frame shows some room beside the text
const insetOf = (layout: FrameLayout) =>
  layout.mode === "pages" ? 0 : BLEED * layout.scale;

/**
 * propertiesPlace returns where the line with the document's properties
 * goes: right above the first page's text and its header, as wide as it
 */
export const propertiesPlace = (layout: FrameLayout) => {
  const first = layout.frames[0];
  if (!first) return null;
  const inset = insetOf(layout);
  return {
    left: first.left + inset,
    top: first.top - layout.headerRoom - PROPERTIES_ROOM - 4,
    width: first.width - 2 * inset,
  };
};

/**
 * firstHeaderPlace returns where the first page's header goes in "page
 * ends": right above its text, as wide as it. The sheets of "pages" show
 * it themselves.
 */
export const firstHeaderPlace = (layout: FrameLayout) => {
  const first = layout.frames[0];
  // the room the layout keeps for it, none without a header
  const room = layout.headerRoom;
  if (!first || layout.mode === "pages" || !room) return null;
  const inset = insetOf(layout);
  return {
    left: first.left + inset,
    top: first.top - room,
    width: first.width - 2 * inset,
    height: room,
  };
};

/**
 * lastFooterPlace returns where the last page's footer goes in "page ends":
 * right below its text, as wide as it, where the mark where a page ends
 * shows a footer. The sheets of "pages" show it themselves.
 */
export const lastFooterPlace = (layout: FrameLayout) => {
  const last = layout.frames[layout.frames.length - 1];
  // the room the layout keeps for it, none without a footer
  const room = layout.footerRoom;
  if (!last || layout.mode === "pages" || !room) return null;
  const inset = insetOf(layout);
  return {
    left: last.left + inset,
    top: last.top + last.height,
    width: last.width - 2 * inset,
    height: room,
  };
};

/**
 * bandTitle returns the tooltip of a header or footer on the pages, which
 * opens its strip on a double click
 */
export const bandTitle = (band: Band) =>
  `Double-click to edit the ${band} (${formatShortcut(
    getKeyBinding(
      band === "header"
        ? CommandIdentifier.EDIT_HEADER
        : CommandIdentifier.EDIT_FOOTER,
    ),
  )})`;

// a spot on a page, in points from its top edge, e.g. the one at the top of
// the view
export interface ViewAnchor {
  page: number;
  y: number;
}

/**
 * viewAnchor returns the spot of a page at `scrollTop` on the desk: on the
 * first page that reaches below it, where the view's top edge crosses it, or
 * its top if the edge is above it, e.g. over the mark where a page ends.
 * Null above the first page, where the view shows the start of the desk
 * whatever the layout.
 */
export const viewAnchor = (
  layout: FrameLayout,
  scrollTop: number,
): ViewAnchor | null => {
  if (scrollTop <= (layout.frames[0]?.top ?? 0)) return null;
  const frame = layout.frames.find(
    (frame) => frame.top + frame.height > scrollTop,
  );
  if (!frame) return null;
  const into = Math.max(0, scrollTop - frame.top) / layout.scale;
  return { page: frame.page, y: frame.y + Math.min(into, frame.h) };
};

/**
 * anchorTop returns where to scroll so that `anchor` is at the top of the
 * view, e.g. after the view switched: a spot the frame doesn't show, like the
 * top margin in "page ends", goes to the frame's nearest edge
 */
export const anchorTop = (layout: FrameLayout, anchor: ViewAnchor) => {
  const frame = layout.frames[anchor.page];
  if (!frame) return null;
  const y = Math.min(Math.max(anchor.y, frame.y), frame.y + frame.h);
  return Math.max(0, frame.top + (y - frame.y) * layout.scale);
};

/**
 * caretLine returns where the caret at `left` is drawn: 1.5 pixels wide
 * rounded to whole device pixels, and on them, so it isn't blurred across
 * two
 * @param ratio device pixels per CSS pixel
 */
export const caretLine = (left: number, ratio: number) => {
  const width = Math.max(1, Math.round(1.5 * ratio));
  const start = Math.round(left * ratio - width / 2);
  return { left: start / ratio, width: width / ratio };
};

/**
 * pageLabel returns "Page N of M" as the bar shows it: where the caret is
 * among the pages, counted from 1, whatever number the pages show, for
 * finding one's way in the document
 */
export const pageLabel = (position: { page: number; pages: number }) =>
  `Page ${position.page} of ${position.pages}`;

// a rectangle on a page, in points
export interface PageBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * selectedOn returns the selection's rectangles on `page` as one string,
 * e.g. "72,90,50,16", so a page shows its selection again only when that
 * string changes; "" for none
 */
export const selectedOn = (
  rects: readonly (PageBox & { page: number })[],
  page: number,
) =>
  rects
    .filter((rect) => rect.page === page)
    .map((rect) =>
      [rect.x, rect.y, rect.width, rect.height]
        .map((value) => Math.round(value * 100) / 100)
        .join(","),
    )
    .join(";");

/**
 * selectedBoxes reads the rectangles selectedOn wrote
 */
export const selectedBoxes = (selected: string): PageBox[] =>
  selected
    ? selected.split(";").map((rect) => {
        const [x, y, width, height] = rect.split(",").map(Number);
        return { x, y, width, height };
      })
    : [];

/**
 * movesPages returns whether a new layout shows the pages elsewhere on the
 * desk: in the other view, at another scale, or below more or less room
 * above the first page, e.g. for its header; typing lays out anew on every
 * key but leaves them where they are
 */
export const movesPages = (next: FrameLayout, previous: FrameLayout) =>
  next.mode !== previous.mode ||
  next.scale !== previous.scale ||
  next.headerRoom !== previous.headerRoom ||
  next.frames[0]?.top !== previous.frames[0]?.top;
