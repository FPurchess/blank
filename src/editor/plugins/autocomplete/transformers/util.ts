import type { Node, NodeType } from "prosemirror-model";
import {
  type Command,
  TextSelection,
  type Transaction,
} from "prosemirror-state";
import { EditorView } from "prosemirror-view";

import { schema } from "../../../../markdown";

import { dispatchCorrection } from "../history";

/**
 * applyBlockCommand turns the block holding the cursor into another block type
 * by running `command`, and deletes the `length` characters of typed shortcut
 * text before the cursor in the same transaction, so a single undo restores
 * the line as typed. If the command can't be applied, nothing changes.
 * @returns whether the block was transformed
 */
export const applyBlockCommand = (
  view: EditorView,
  command: Command,
  length: number,
): boolean => {
  if (!(view.state.selection as TextSelection).$cursor) return false;
  let captured: Transaction | undefined;
  if (!command(view.state, (tr) => (captured = tr), view) || !captured) {
    return false;
  }

  const { $cursor } = captured.selection as TextSelection;
  if (!$cursor) return false;
  captured.delete($cursor.pos - length, $cursor.pos);
  dispatchCorrection(view, captured);
  return true;
};

/**
 * replaceLineWith replaces the paragraph holding the cursor with a node of
 * `type` (or `node`, as made), e.g. a rule, and an empty paragraph after it.
 * The cursor goes into that paragraph, or `cursor` positions into the node,
 * e.g. into a diagram's source. A single undo restores the line as typed.
 * @returns whether the line was replaced
 */
export const replaceLineWith = (
  view: EditorView,
  type: NodeType | Node,
  { cursor }: { cursor?: number } = {},
): boolean => {
  const { $cursor } = view.state.selection as TextSelection;
  if (!$cursor || $cursor.parent.type !== schema.nodes.paragraph) {
    return false;
  }
  const node = "nodeSize" in type ? type : type.createAndFill();
  if (!node) return false;
  const from = $cursor.before();
  const tr = view.state.tr.replaceWith(from, $cursor.after(), [
    node,
    schema.nodes.paragraph.create(),
  ]);
  // into the node, or else into the paragraph after it, past its opening
  const at = cursor === undefined ? from + node.nodeSize + 1 : from + cursor;
  tr.setSelection(TextSelection.create(tr.doc, at));
  dispatchCorrection(view, tr);
  return true;
};
