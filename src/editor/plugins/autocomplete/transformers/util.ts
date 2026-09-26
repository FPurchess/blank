import type { Command, TextSelection, Transaction } from "prosemirror-state";
import { EditorView } from "prosemirror-view";

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
