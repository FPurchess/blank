import { CommandIdentifier, getKeyBinding } from "../config";
import { formatShortcut } from "../editor/keyBindings";
import { BLEED, type FrameLayout, PROPERTIES_ROOM } from "../engine/frames";
import type { Band } from "../layout/bands";

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
 * opens its strip
 */
export const bandTitle = (band: Band) =>
  `Edit the ${band} (${formatShortcut(
    getKeyBinding(
      band === "header"
        ? CommandIdentifier.EDIT_HEADER
        : CommandIdentifier.EDIT_FOOTER,
    ),
  )})`;
