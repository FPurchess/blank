import { wrapIn } from "prosemirror-commands";
import type { Command, EditorState } from "prosemirror-state";
import { liftTarget } from "prosemirror-transform";

import { schema } from "../../markdown";

/**
 * quoteRange returns the range of the selected blocks in the quote they're
 * in, or null if they aren't in one
 */
const quoteRange = (state: EditorState) => {
  const { $from, $to } = state.selection;
  return $from.blockRange($to, (node) => node.type === schema.nodes.blockquote);
};

/**
 * inQuote tells whether the selection is in a quote
 */
export const inQuote = (state: EditorState) => quoteRange(state) !== null;

/**
 * toggleQuote takes the selected blocks out of the quote they're in, even
 * from a list inside it, or puts them into a new one
 */
export const toggleQuote: Command = (state, dispatch) => {
  const range = quoteRange(state);
  if (!range) return wrapIn(schema.nodes.blockquote)(state, dispatch);
  const target = liftTarget(range);
  if (target === null) return false;
  if (dispatch) dispatch(state.tr.lift(range, target).scrollIntoView());
  return true;
};
