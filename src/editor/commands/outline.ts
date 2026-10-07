import type { Command } from "prosemirror-state";

import { toggleOutline } from "../../state";

/**
 * showOutline keeps the outline open beside the pages or closes it, or on a
 * narrow window opens or closes it floating over them
 */
export const showOutline = (): Command => (_state, dispatch) => {
  if (dispatch) toggleOutline();
  return true;
};
