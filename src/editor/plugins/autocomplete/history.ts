import { closeHistory } from "prosemirror-history";
import type { Transaction } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";

/**
 * dispatchCorrection dispatches `tr` as an undo step of its own, so a single
 * undo reverts exactly the correction and keeps what was typed
 */
export const dispatchCorrection = (view: EditorView, tr: Transaction) => {
  view.dispatch(closeHistory(tr).scrollIntoView());
  // keeps the next keystroke from being merged into the correction's step
  view.dispatch(closeHistory(view.state.tr));
};
