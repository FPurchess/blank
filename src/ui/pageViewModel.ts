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
 * endMark returns what the mark at the end of a page shows: its footer,
 * with its number when the footer doesn't show it, and the next page's
 * header
 * @param page the page, counted from 0
 * @param bands the band texts of the page and of the next, see
 *   PageEngine.bands
 * @param layout the document's page setup, which numbers the pages
 */
export const endMark = (
  page: number,
  bands: string[],
  next: string[] | null,
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
    header: next ? next.slice(0, 3) : ["", "", ""],
  };
};

// the room above the first page for its header in "page ends", until
// frames.ts keeps it (HEADER_ROOM, FrameLayout.headerRoom): the header sits
// in the room above the first page there is anyway
const FALLBACK_ROOM = 20;

/**
 * headerRoom returns the room the layout keeps above the first page for
 * its header, in pixels
 */
export const headerRoom = (layout: FrameLayout) =>
  (layout as FrameLayout & { headerRoom?: number }).headerRoom;

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
    top: first.top - (headerRoom(layout) ?? 0) - PROPERTIES_ROOM - 4,
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
  if (!first || layout.mode === "pages") return null;
  const inset = insetOf(layout);
  const room = headerRoom(layout) ?? FALLBACK_ROOM;
  return {
    left: first.left + inset,
    top: first.top - room,
    width: first.width - 2 * inset,
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
