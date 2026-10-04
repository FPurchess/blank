import type { Node, Slice } from "prosemirror-model";

import { serializeMarkdown } from "../../markdown";
import { isContentBlock } from "../../markdown/blocks/names";

// The plain text of what is copied, where it holds a content block: its
// markdown, so a table of contents, a form or a drawing pasted into another
// app reads as it would in the file, the definitions of its forms with it.
// Text, and text with tables, is copied as plain text as before.

/**
 * holdsBlock returns whether `slice` holds a whole content block at the top
 * of the document, rather than text inside one of its fields
 */
const holdsBlock = (slice: Slice) => {
  const { content, openStart, openEnd } = slice;
  let holds = false;
  content.forEach((node, _offset, index) => {
    const cut =
      (index === 0 && openStart > 0) ||
      (index === content.childCount - 1 && openEnd > 0);
    if (isContentBlock(node) && !cut) holds = true;
  });
  return holds;
};

/**
 * blocksMarkdown returns the markdown of `slice`, copied from `doc`, if it
 * holds a content block, or else null
 */
export const blocksMarkdown = (slice: Slice, doc: Node): string | null => {
  if (!holdsBlock(slice)) return null;
  const copied = doc.type.create(
    {
      frontmatter: null,
      definitions: doc.attrs.definitions,
      rawDefinitions: [],
    },
    slice.content,
  );
  return serializeMarkdown(copied).trimEnd();
};
