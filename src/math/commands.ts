import type { Node } from "prosemirror-model";
import {
  type Command,
  type EditorState,
  TextSelection,
  type Transaction,
} from "prosemirror-state";

import { createSourceBlock } from "../markdown/blocks/sourceBlock";

/*
 * Making math: Mod-Shift-m (insert.math) and the block shortcut `$$` +
 * Enter. Both open the new formula's source, so it can be typed at once.
 */

/**
 * displayMathFor replaces the paragraph from `from` to `to` with display
 * math holding `source`, with the caret at the end of its source; a
 * paragraph follows when nothing else would
 */
export const displayMathFor = (
  state: EditorState,
  from: number,
  to: number,
  source = "",
): Transaction => {
  const { schema } = state;
  const math = createSourceBlock(schema, "math_display", source);
  const $to = state.doc.resolve(to);
  const last = $to.index($to.depth) >= $to.node($to.depth).childCount;
  const tr = state.tr.replaceWith(
    from,
    to,
    last ? [math, schema.nodes.paragraph.create()] : [math],
  );
  // the wrapper's start, the source's start, then its text
  return tr.setSelection(
    TextSelection.create(tr.doc, from + 2 + source.length),
  );
};

/**
 * mathAllowedAt tells whether display math may take the place of the
 * paragraph the selection's head is in
 */
export const mathAllowedAt = (state: EditorState) => {
  const { $head } = state.selection;
  if ($head.parent.type.name !== "paragraph" || $head.depth < 1) return false;
  return $head
    .node(-1)
    .canReplaceWith(
      $head.index(-1),
      $head.indexAfter(-1),
      state.schema.nodes.math_display,
    );
};

const inCode = (state: EditorState) => {
  const { $from } = state.selection;
  return (
    !!$from.parent.type.spec.code ||
    $from.marks().some((mark) => mark.type.name === "code")
  );
};

/**
 * insertMath makes a formula: display math in an empty paragraph, inline
 * math elsewhere, with the selected text as its source. Not in code nor
 * in math.
 */
export const insertMath: Command = (state, dispatch) => {
  if (inCode(state)) return false;
  const { selection, schema } = state;
  const { $from, empty } = selection;
  if (
    empty &&
    $from.parent.type.name === "paragraph" &&
    $from.parent.content.size === 0 &&
    mathAllowedAt(state)
  ) {
    if (dispatch) {
      dispatch(
        displayMathFor(state, $from.before(), $from.after()).scrollIntoView(),
      );
    }
    return true;
  }
  if (!$from.parent.inlineContent || !$from.sameParent(selection.$to)) {
    return false;
  }
  const source = state.doc
    .textBetween(selection.from, selection.to, " ", " ")
    .replace(/\s*\n\s*/g, " ");
  if (
    !$from.parent.canReplaceWith(
      $from.index(),
      selection.$to.index(),
      schema.nodes.math_inline,
    )
  ) {
    return false;
  }
  if (dispatch) {
    const node: Node = schema.nodes.math_inline.create(
      null,
      source ? schema.text(source) : null,
      $from.marks(),
    );
    const tr = state.tr.replaceSelectionWith(node, false);
    // in it, after its source
    tr.setSelection(
      TextSelection.create(tr.doc, selection.from + 1 + source.length),
    );
    dispatch(tr.scrollIntoView());
  }
  return true;
};
