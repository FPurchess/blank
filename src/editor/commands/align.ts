import type { Node } from "prosemirror-model";
import type { Command, EditorState } from "prosemirror-state";
import { isInTable, selectedRect } from "prosemirror-tables";

import { type TextAlignment, textAlignment } from "../../markdown";
import { capsOf } from "../../markdown/blocks/caps";
import { alignColumns } from "./table/format";
import { cellsOfColumns } from "./table/rect";

// The alignment of text: of the paragraphs and headings at the top of the
// document, and of blocks that can be aligned (diagrams), or in a table of
// its columns, as markdown aligns whole columns.
// Lists, quotes, code and form fields keep no alignment (see
// src/markdown/alignment.ts).

export type Align = "left" | TextAlignment;

/**
 * alignedBlocks returns the paragraphs and headings at the top of the
 * document the selection touches, with their positions; none in a table
 */
const alignedBlocks = (state: EditorState): { pos: number; node: Node }[] => {
  if (isInTable(state)) return [];
  const { $from, $to } = state.selection;
  // the top-level blocks from the one the selection starts in to the one it
  // ends in; it ends before a block when it ends between two
  const first = $from.index(0);
  const last = $to.depth > 0 ? $to.index(0) : $to.index(0) - 1;
  const found: { pos: number; node: Node }[] = [];
  state.doc.forEach((node, pos, index) => {
    if (index >= first && index <= Math.max(first, last)) {
      found.push({ pos, node });
    }
  });
  return found.filter(
    ({ node }) =>
      node.type === state.schema.nodes.paragraph ||
      node.type === state.schema.nodes.heading ||
      // a block that can be aligned, e.g. a diagram (see
      // src/markdown/blocks/caps.ts)
      capsOf(node.type).align === true,
  );
};

/**
 * columnAlignment returns how the selected columns of a table are aligned,
 * left for cells of the default alignment, or null if they differ
 */
const columnAlignment = (state: EditorState): Align | null => {
  const rect = selectedRect(state);
  const aligns = new Set(
    cellsOfColumns(rect, rect.left, rect.right).map(
      (pos) =>
        (rect.table.nodeAt(pos - rect.tableStart)!.attrs.align as
          string | null) ?? "left",
    ),
  );
  return aligns.size === 1 ? ([...aligns][0] as Align) : null;
};

/**
 * alignmentAt returns how the selected text is aligned, left included, or
 * null where it can't be aligned or the selected blocks differ
 */
export const alignmentAt = (state: EditorState): Align | null => {
  if (isInTable(state)) return columnAlignment(state);
  const blocks = alignedBlocks(state);
  const aligns = new Set(
    blocks.map(({ node }) => textAlignment(node.attrs.align) ?? "left"),
  );
  return aligns.size === 1 ? ([...aligns][0] as Align) : null;
};

/**
 * alignText aligns the selected paragraphs and headings `align`, or back to
 * the left if they are aligned that way already; in a table it aligns the
 * selected columns, which can't be justified
 */
export const alignText =
  (align: Align): Command =>
  (state, dispatch) => {
    if (isInTable(state)) {
      return align !== "justify" && alignColumns(align)(state, dispatch);
    }
    // a block of no text, e.g. a diagram, can't be justified
    const blocks = alignedBlocks(state).filter(
      ({ node }) => align !== "justify" || node.isTextblock,
    );
    if (blocks.length === 0) return false;
    if (dispatch) {
      const value =
        align === "left" || alignmentAt(state) === align ? null : align;
      // only the blocks it changes, so aligning text as it is changes nothing
      const changed = blocks.filter(({ node }) => node.attrs.align !== value);
      if (changed.length === 0) return true;
      const tr = state.tr;
      for (const { pos } of changed) tr.setNodeAttribute(pos, "align", value);
      dispatch(tr.scrollIntoView());
    }
    return true;
  };
