import { schema } from "prosemirror-markdown";

import type { Context } from "../context";
import type { InlineTransformer } from "../types";

// Markdown image and link syntax ending at the cursor
const reImage = /!\[([^\]￼]*)\]\(([^)\s￼]+)\)$/;
const reLink = /\[([^\]￼]+)\]\(([^)\s￼]+)\)$/;

/**
 * link turns `![alt](src)` into an image and `[title](url)` into a link. The
 * link keeps the marks of its title, e.g. bold.
 */
const link: InlineTransformer = (ctx: Context) => {
  if (!ctx.config.links) return;

  const image = reImage.exec(ctx.textBefore);
  if (image) {
    const from = ctx.start + image.index;
    const [match, alt, src] = image;
    return (tr) => {
      tr.replaceWith(
        from,
        from + match.length,
        schema.nodes.image.create({ src, alt: alt || null }),
      );
    };
  }

  const match = reLink.exec(ctx.textBefore);
  if (!match) return;
  const [whole, title, href] = match;
  const from = ctx.start + match.index;
  const titleTo = from + 1 + title.length;
  return (tr) => {
    // remove "](url)" first, so the positions before it stay valid
    tr.delete(titleTo, from + whole.length);
    tr.delete(from, from + 1);
    tr.addMark(from, titleTo - 1, schema.marks.link.create({ href }));
  };
};

export default link;
