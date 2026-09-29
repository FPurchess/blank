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

/**
 * propertiesPlace returns where the line with the document's properties
 * goes: right above the first page's text, as wide as it
 */
export const propertiesPlace = (layout: FrameLayout) => {
  const first = layout.frames[0];
  if (!first) return null;
  // in "page ends" the frame shows some room beside the text
  const inset = layout.mode === "pages" ? 0 : BLEED * layout.scale;
  return {
    left: first.left + inset,
    top: first.top - PROPERTIES_ROOM - 4,
    width: first.width - 2 * inset,
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
