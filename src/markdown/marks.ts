import { Fragment, type Node } from "prosemirror-model";

import { schema } from "./schema";

/**
 * withoutLinkUnderline returns `fragment` without the underline on text that
 * is a link: Word and Google Docs underline every link with a style, which
 * would come in as underlined text and be saved as <u> inside each link
 */
export const withoutLinkUnderline = (fragment: Fragment): Fragment => {
  const { link, underline } = schema.marks;
  let changed = false;
  const nodes: Node[] = [];
  fragment.forEach((node) => {
    if (node.isText) {
      if (link.isInSet(node.marks) && underline.isInSet(node.marks)) {
        changed = true;
        nodes.push(node.mark(underline.removeFromSet(node.marks)));
      } else nodes.push(node);
    } else if (node.isLeaf) {
      nodes.push(node);
    } else {
      const content = withoutLinkUnderline(node.content);
      if (content !== node.content) changed = true;
      nodes.push(content === node.content ? node : node.copy(content));
    }
  });
  return changed ? Fragment.from(nodes) : fragment;
};
