import type { MarkType } from "prosemirror-model";
import type { EditorState } from "prosemirror-state";

import { schema } from "../markdown";
import { listAround } from "./commands/lists";
import { within } from "./commands/around";
import { inQuote } from "./commands/quote";

// What the selection is, for the formatting toolbar's pressed buttons and its
// style menu (src/ui/formatToolbarModel.ts).

export { alignmentAt } from "./commands/align";
export { inQuote };

/**
 * markActive tells whether the caret's marks have `type` (those it will type
 * with), or every bit of text in the selection has it
 */
export const markActive = (state: EditorState, type: MarkType) => {
  const { empty, $from, ranges } = state.selection;
  if (empty) return !!type.isInSet(state.storedMarks ?? $from.marks());
  // what toggleMark counts: inline content that may have the mark, but
  // whitespace alone, which it leaves as it is
  let marked = false;
  let missing = false;
  for (const range of ranges) {
    const [from, to] = [range.$from.pos, range.$to.pos];
    state.doc.nodesBetween(from, to, (node, pos, parent) => {
      if (missing) return false;
      if (!node.isInline) return true;
      if (!parent?.type.allowsMarkType(type)) return false;
      const text = node.isText
        ? node.textBetween(
            Math.max(0, from - pos),
            Math.min(node.nodeSize, to - pos),
          )
        : "x";
      if (/^\s*$/.test(text)) return false;
      if (type.isInSet(node.marks)) marked = true;
      else missing = true;
      return false;
    });
  }
  return marked && !missing;
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
  const styles = new Set<BlockStyle>();
  for (const { $from, $to } of state.selection.ranges) {
    state.doc.nodesBetween($from.pos, $to.pos, (node, pos) => {
      if (!node.isTextblock) return true;
      if (node.type === schema.nodes.code_block) styles.add("code_block");
      else if (node.type === schema.nodes.heading) {
        styles.add(`heading${node.attrs.level as 1 | 2 | 3 | 4 | 5 | 6}`);
      } else {
        const quoted = within(state.doc.resolve(pos), schema.nodes.blockquote);
        styles.add(quoted ? "quote" : "paragraph");
      }
      return false;
    });
  }
  return styles.size === 1 ? [...styles][0] : null;
};
