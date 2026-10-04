import type { Command } from "prosemirror-state";

import { cycleFocus } from "../../state";

/**
 * moveFocus moves the focus to the next part of the window, or the previous
 * one for -1: the editor, the tab row, and the bars after it (F6)
 */
export const moveFocus =
  (direction: 1 | -1): Command =>
  (_state, dispatch, view) => {
    if (dispatch && view) {
      cycleFocus(direction, document.activeElement, () => view.focus());
    }
    return true;
  };
