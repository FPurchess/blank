import type { Command } from "prosemirror-state";

import { focusMode, setFocusMode } from "../../state";

/**
 * toggleFocusMode turns focus mode on or off, see src/state/focusMode.ts
 */
export const toggleFocusMode = (): Command => () => {
  setFocusMode(!focusMode.value);
  return true;
};
