import type { Node } from "prosemirror-model";

import { type Box, blockBoxes, gapLine } from "../engine/geometry";
import { isContentBlock } from "../markdown/blocks/names";
import { topBlockAt } from "../markdown/topBlock";

// What BlockMarks.vue shows over the pages: the line where a dragged block
// drops, and the hairline around the content block under the pointer.

/**
 * dropLineOf returns the line that shows where a dragged block drops into
 * `doc`, at `gap`, or null while none is dragged
 */
export const dropLineOf = (doc: Node, gap: number | null) =>
  gap === null || gap > doc.content.size ? null : gapLine(doc, gap);

/**
 * hoverBoxesOf returns the boxes of the content block from `from` to `to`
 * under the pointer, one per page, or none while there is none or it is
 * the selected one
 */
export const hoverBoxesOf = (
  doc: Node,
  block: { from: number; to: number } | null,
  selected: { from: number; to: number } | null,
): Box[] => {
  if (!block || block.to > doc.content.size) return [];
  if (selected?.from === block.from && selected.to === block.to) return [];
  return blockBoxes(block.from, block.to);
};

/**
 * styleOf returns the inline style of a box in the window
 */
export const styleOf = (box: Box) => ({
  left: `${box.left}px`,
  top: `${box.top}px`,
  width: `${box.right - box.left}px`,
  height: `${box.bottom - box.top}px`,
});

/**
 * contentBlockAt returns where the content block at the top of `doc` that
 * holds `pos` starts and ends, or null where there is none
 */
export const contentBlockAt = (doc: Node, pos: number | null) => {
  if (pos === null || pos < 0 || pos >= doc.content.size) return null;
  const block = topBlockAt(doc, pos);
  return block && isContentBlock(block.node)
    ? { from: block.from, to: block.to }
    : null;
};
