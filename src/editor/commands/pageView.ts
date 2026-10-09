import type { Command } from "prosemirror-state";

import { announce, pageView } from "../../state";

/**
 * togglePageView switches between the page ends and the pages themselves
 */
export const togglePageView = (): Command => (_state, dispatch) => {
  if (!dispatch) return true;
  pageView.value = pageView.value === "pages" ? "page-ends" : "pages";
  announce(pageView.value === "pages" ? "Pages" : "Page ends");
  return true;
};
