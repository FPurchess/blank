import type { Command } from "prosemirror-state";

import type { Hit } from "../../engine/engine";
import { pageViewKey, POINTER, selectionAt } from "../plugins/pageView";

/**
 * pageSelect selects what the pointer hit on the painted pages: a caret, a
 * node, or, with `anchor`, the range from it, e.g. while dragging
 */
export const pageSelect =
  (hit: Hit, anchor?: number): Command =>
  (state, dispatch) => {
    const selection = selectionAt(state, hit, anchor);
    if (selection.eq(state.selection)) return true;
    dispatch?.(
      state.tr.setSelection(selection).setMeta(pageViewKey, { by: POINTER }),
    );
    return true;
  };

/**
 * pageSelectRange selects from `from` to `to`, e.g. a word the pointer
 * double-clicked
 */
export const pageSelectRange =
  (from: number, to: number): Command =>
  (state, dispatch) =>
    pageSelect({ node: false, pos: to }, from)(state, dispatch);
