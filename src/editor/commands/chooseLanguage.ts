import type { Command } from "prosemirror-state";

import { openPicker } from "../../languagePicker";

export default (): Command => () => {
  openPicker();
  return true;
};
