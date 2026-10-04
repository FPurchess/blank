import type { Span } from "../state";

// Dragging things that sit in a line, e.g. table rows or tabs: the lines
// between them, by position, and where a drag lands among them.

/**
 * dropAt returns the line of `lines` where rows, columns or tabs dragged from
 * `span` land for the mouse at `value`: not within them, and not before
 * `min`, e.g. the header rows
 */
export const dropAt = (
  lines: readonly number[],
  [from, to]: Span,
  value: number,
  min: number,
) => {
  let best = from;
  for (let i = Math.max(min, 0); i < lines.length; i++) {
    if (i > from && i < to) continue;
    if (Math.abs(lines[i] - value) < Math.abs(lines[best] - value)) best = i;
  }
  return best;
};

/**
 * movedBy returns by how many rows, columns or tabs dropping `span` at the line
 * `line` moves it
 */
export const movedBy = ([from, to]: Span, line: number) =>
  line < from ? line - from : line > to ? line - to : 0;
