import { Plugin } from "prosemirror-state";
import { Slice } from "prosemirror-model";

import { withoutLinkUnderline } from "../../markdown/marks";

/**
 * pastedLinks drops the underline of links pasted from other apps, which
 * Google Docs and LibreOffice put on every link: it would be saved as <u>
 * inside each one. Blank's own copies keep an underline the user set.
 */
export const pastedLinks = () => {
  // set between another app's HTML and the slice it becomes, which
  // ProseMirror reads in one go
  let fromElsewhere = false;
  return new Plugin({
    props: {
      transformPastedHTML: (html) => {
        fromElsewhere = !/data-pm-slice/.test(html);
        return html;
      },
      transformPasted: (slice) => {
        if (!fromElsewhere) return slice;
        fromElsewhere = false;
        const content = withoutLinkUnderline(slice.content);
        return content === slice.content
          ? slice
          : new Slice(content, slice.openStart, slice.openEnd);
      },
    },
  });
};
