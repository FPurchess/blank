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
