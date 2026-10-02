import { Plugin } from "prosemirror-state";

import { publishHeadings } from "../../state";

/**
 * headings publishes the document's headings (src/state/headings.ts) for the
 * outline: from the view, which sees the document after every transaction
 * a plugin appended (the table guard's paragraphs), and the documents that
 * replace the state when a file opens
 */
export const headings = () =>
  new Plugin({
    view: (view) => {
      publishHeadings(view.state.doc);
      return {
        update: (view, previous) => {
          if (view.state.doc !== previous.doc) publishHeadings(view.state.doc);
        },
      };
    },
  });
