import type { Command } from "prosemirror-state";

import { mainMenuWanted } from "../../state";

let asked = 0;

/**
 * openMainMenu opens the main menu behind the logo, with the focus in its
 * search; while it's open, its own key handles the key
 */
export const openMainMenu = (): Command => (_state, dispatch) => {
  if (dispatch) mainMenuWanted.value = { id: ++asked };
  return true;
};
