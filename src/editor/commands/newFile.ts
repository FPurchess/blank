import type { Command } from "prosemirror-state";

import { importedFrom, path } from "../../state";
import { REPLACE_DOCUMENT } from "../plugins/spellcheck";

export default (): Command => (state, dispatch) => {
  if (dispatch) {
    dispatch(
      state.tr
        .delete(0, state.doc.content.size)
        .setMeta(REPLACE_DOCUMENT, true),
    );
    path.value = null;
    importedFrom.value = null;
    return true;
  }

  return false;
};
