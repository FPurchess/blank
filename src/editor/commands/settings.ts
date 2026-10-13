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
    if (dispatch) showSettings(section);
    return true;
  };

/**
 * showSettings opens the settings dialog, at `section` if given, unless
 * it's open
 */
export const showSettings = (section?: SettingsSection) => {
  if (settingsDialog.value) return;
  if (section) settingsSection.value = section;
  settingsDialog.value = {};
};
