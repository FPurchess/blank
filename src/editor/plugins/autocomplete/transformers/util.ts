import type { Command, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";

/**
 * applyBlockCommand turns the block holding the cursor into another block type
 * by running `command`, then deletes the `length` characters of typed shortcut
 * text before the cursor. If the command can't be applied, nothing changes.
 * @returns whether the block was transformed
 */
export const applyBlockCommand = (
  view: EditorView,
  command: Command,
  length: number,
): boolean => {
  if (!(view.state.selection as TextSelection).$cursor) return false;
  if (!command(view.state, (tr) => view.dispatch(tr), view)) return false;

  const { $cursor } = view.state.selection as TextSelection;
  if (!$cursor) return false;
  view.dispatch(
    view.state.tr.delete($cursor.pos - length, $cursor.pos).scrollIntoView(),
  );
  return true;
};
