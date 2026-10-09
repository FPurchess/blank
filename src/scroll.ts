// How far to scroll to bring something into view, for the page view and the
// geometry (src/engine/geometry.ts), which the editor's plugins measure with.

/**
 * scrollFor returns where to scroll so that `rect`, e.g. on the desk, is in
 * the view from `top` that is `height` high, or null if it already is; the
 * same across, with left and width for top and height
 * @param above the space to keep before it, and `below` after it
 */
export const scrollFor = (
  rect: { top: number; height: number },
  top: number,
  height: number,
  { above = 20, below = 64 } = {},
) => {
  if (rect.top - above < top) return Math.max(0, rect.top - above);
  if (rect.top + rect.height + below > top + height) {
    return rect.top + rect.height + below - height;
  }
  return null;
};
