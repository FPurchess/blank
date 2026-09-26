import type { Command } from "prosemirror-state";

import { importedFrom, path } from "../../state";

export default (): Command => (state, dispatch) => {
  if (dispatch) {
    dispatch(state.tr.delete(0, state.doc.content.size));
    path.value = null;
    importedFrom.value = null;
    return true;
  }

  return false;
};
