import type { Command } from "prosemirror-state";

import { openPicker } from "../../languagePicker";

export default (): Command => (_state, dispatch) => {
  if (dispatch) openPicker();
  return true;
};
