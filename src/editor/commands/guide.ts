import type { Command } from "prosemirror-state";

import { GUIDE } from "../../links";
import { _openLink } from "../plugins/openLink";

/**
 * openGuide opens Blank's guide on the website, in the browser
 */
export const openGuide = (): Command => (_state, dispatch) => {
  if (dispatch) void _openLink(GUIDE);
  return true;
};
