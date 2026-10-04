import { Plugin } from "prosemirror-state";
import { Slice } from "prosemirror-model";

import { withoutLinkUnderline } from "../../markdown/marks";

/**
 * pastedLinks drops the underline of pasted links, which Word and Google Docs
 * put on every link: it would be saved as <u> inside each one
 */
export const pastedLinks = () =>
  new Plugin({
    props: {
      transformPasted: (slice) => {
        const content = withoutLinkUnderline(slice.content);
        return content === slice.content
          ? slice
          : new Slice(content, slice.openStart, slice.openEnd);
      },
    },
  });
