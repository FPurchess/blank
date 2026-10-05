import type { Command } from "prosemirror-state";

import { settingsDialog } from "../../state";

/**
 * openSettings opens the settings dialog, on the section shown last
 */
export const openSettings = (): Command => () => {
  if (!settingsDialog.value) settingsDialog.value = {};
  return true;
};
