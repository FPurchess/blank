import type { MarkType } from "prosemirror-model";
import type { EditorState } from "prosemirror-state";

import { schema } from "../markdown";
import { listAround } from "./commands/lists";
import { inQuote } from "./commands/quote";

// What the selection is, for the formatting toolbar's pressed buttons and its
// style menu (src/ui/formatToolbarModel.ts).

export { alignmentAt } from "./commands/align";
export { inQuote, listAround };

/**
 * markActive tells whether the caret's marks have `type` (those it will type
 * with), or every bit of text in the selection has it
 */
export const markActive = (state: EditorState, type: MarkType) => {
  const { empty, $from, from, to } = state.selection;
  if (empty) return !!type.isInSet(state.storedMarks ?? $from.marks());
  let text = false;
  let all = true;
  state.doc.nodesBetween(from, to, (node) => {
    if (!all) return false;
    if (node.isText) {
      text = true;
      if (!type.isInSet(node.marks)) all = false;
    }
    return true;
  });
  return text && all;
};

/**
 * listTypeAt returns the kind of the innermost list around the selection
 */
export const listTypeAt = (state: EditorState) =>
  listAround(state)?.node.type.name ?? null;

export type BlockStyle =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "heading4"
  | "heading5"
  | "heading6"
  | "quote"
  | "code_block";

/**
 * blockStyleAt returns the style of the selected textblocks, as the style
 * menu names them: a code block, a heading by its level, a paragraph in a
 * quote, any other paragraph; null where they differ
 */
export const blockStyleAt = (state: EditorState): BlockStyle | null => {
  const { $from, $to } = state.selection;
  const styles = new Set<BlockStyle>();
  state.doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
    if (!node.isTextblock) return true;
    if (node.type === schema.nodes.code_block) styles.add("code_block");
    else if (node.type === schema.nodes.heading) {
      styles.add(`heading${node.attrs.level as 1 | 2 | 3 | 4 | 5 | 6}`);
    } else {
      const $pos = state.doc.resolve(pos);
      let quoted = false;
      for (let depth = $pos.depth; depth > 0; depth--) {
        if ($pos.node(depth).type === schema.nodes.blockquote) quoted = true;
      }
      styles.add(quoted ? "quote" : "paragraph");
    }
    return false;
  });
  return styles.size === 1 ? [...styles][0] : null;
};
