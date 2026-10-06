import type { Command } from "prosemirror-state";

import {
  type SettingsSection,
  settingsDialog,
  settingsSection,
} from "../../state";

/**
 * openSettings opens the settings dialog on `section`, or on the section
 * shown last
 */
export const openSettings =
  (section?: SettingsSection): Command =>
  (_state, dispatch) => {
    if (dispatch && !settingsDialog.value) {
      if (section) settingsSection.value = section;
      settingsDialog.value = {};
    }
    return true;
  };
