import type { Command } from "prosemirror-state";

import { cycleFocus } from "../../state";

/**
 * moveFocus moves the focus to the next part of the window, or the previous
 * one for -1 (F6): the editor, then the parts that registered a focus stop,
 * e.g. the tab row (see cycleFocus)
 */
export const moveFocus =
  (direction: 1 | -1): Command =>
  (_state, dispatch, view) => {
    if (dispatch && view) {
      cycleFocus(direction, document.activeElement, () => view.focus());
    }
    return true;
  };
