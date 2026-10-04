// The line the view is read at (READING_LINE, see src/engine/geometry.ts):
// what is at or above it is what the view shows. The outline marks the
// section of the heading there, and the bottom bar counts the page there.
import { READING_LINE } from "../engine/geometry";

export { READING_LINE };

/**
 * sectionAt returns which of `tops` the view shows the section of: the last
 * one at or above the reading line, or the first one if none is; at the end
 * of the view, the last one in it, since the last ones can't scroll up that
 * far
 * @param tops where each section starts, in the coordinates of the
 * scrolling, in order; null for one that isn't laid out
 * @param top how far the view is scrolled
 * @param height the view's height
 * @param max how far it can scroll
 */
export const sectionAt = (
  tops: readonly (number | null)[],
  top: number,
  height: number,
  max: number,
) => {
  const measured = tops.flatMap((at, index) =>
    at === null ? [] : [{ at, index }],
  );
  if (measured.length === 0) return 0;
  const lastAtOrAbove = (line: number) => {
    let low = 0;
    let high = measured.length - 1;
    let found = -1;
    while (low <= high) {
      const middle = (low + high) >> 1;
      if (measured[middle].at <= line) {
        found = middle;
        low = middle + 1;
      } else high = middle - 1;
    }
    return found;
  };
  const atEnd = max > 0 && top >= max - 1;
  const found = atEnd
    ? lastAtOrAbove(top + height - 1)
    : lastAtOrAbove(top + READING_LINE + 1);
  return measured[Math.max(0, found)].index;
};
