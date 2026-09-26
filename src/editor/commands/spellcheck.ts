import { type Command, TextSelection } from "prosemirror-state";

import { spellcheck, spellcheckMessage, spellcheckStatus } from "../../state";
import { openContextMenu } from "../plugins/contextMenu";
import { nextMisspelling } from "../plugins/spellcheck";

/**
 * toggleSpellcheck turns spell check on or off
 */
export const toggleSpellcheck = (): Command => () => {
  spellcheck.value = !spellcheck.value;
  return true;
};

/**
 * goToMisspelling selects the next misspelled word, or with `direction` -1 the
 * previous one, and opens the context menu for it
 */
export const goToMisspelling =
  (direction: 1 | -1): Command =>
  (state, dispatch, view) => {
    if (!spellcheck.value) return false;
    if (spellcheckStatus.value.state !== "ready") {
      spellcheckMessage.value = "Spell check isn't ready";
      return true;
    }
    const { from, to } = state.selection;
    const found = nextMisspelling(
      state,
      direction === 1 ? to : from,
      direction,
    );
    if (!found) {
      spellcheckMessage.value = "No spelling errors";
      return true;
    }
    if (dispatch) {
      dispatch(
        state.tr
          .setSelection(TextSelection.create(state.doc, found.from, found.to))
          .scrollIntoView(),
      );
    }
    if (view) openContextMenu(view, found.from, { keyboard: true });
    return true;
  };

/**
 * openMenu opens the context menu at the cursor
 */
export const openMenu = (): Command => (state, _dispatch, view) => {
  if (!view) return false;
  openContextMenu(view, state.selection.head, { keyboard: true });
  return true;
};
