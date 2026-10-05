import { Plugin } from "prosemirror-state";

import { leaveFocusMode } from "../../state";

/**
 * focusModeKeys leaves focus mode on Esc in the text, when no plugin before
 * it took Esc (a form selects itself with it, a picker closes). It comes last:
 * ProseMirror takes every Esc in the editor, so the window never sees it free.
 */
export const focusModeKeys = () =>
  new Plugin({
    props: {
      handleKeyDown: (_view, event) =>
        event.key === "Escape" && leaveFocusMode(),
    },
  });
