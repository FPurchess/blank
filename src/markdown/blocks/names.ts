import type { Node } from "prosemirror-model";

import { formDefinition } from "./definitions";
import { embedLabel } from "./embeds";

// What a content block is called where Blank speaks of it: its toolbar, and
// what Blank says when one is inserted or removed.

/**
 * isContentBlock returns whether `node` is a content block, which stands
 * only at the top of the document
 */
export const isContentBlock = (node: Node) => node.type.isInGroup("top_block");

/**
 * blockName returns what the content block `node` of `doc` is called, e.g.
 * "Table of contents" or the name of a form
 */
export const blockName = (doc: Node, node: Node) => {
  switch (node.type.name) {
    case "toc":
      return "Table of contents";
    case "form_block":
      return formDefinition(doc, node)?.name ?? "Form";
    case "embed":
      return embedLabel(node);
    case "diagram":
      return "Diagram";
    default:
      return "Block Blank can't show";
  }
};
