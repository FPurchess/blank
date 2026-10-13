import type { Fragment, Node } from "prosemirror-model";

import { inlineMarkdown } from "../markdown/math/serialize";
import { isSourceNode } from "../sources/registry";

// what stands for a node that isn't text, one per position it takes
export const LEAF = "￼";

/**
 * maskedText returns the text of a textblock up to `to` (its whole text by
 * default) where every character stands for one position: text as it is,
 * every other node (a hard break, an image, inline math with its source) as
 * LEAFs, one per position. With `code`, inline code is spaces.
 */
export const maskedText = (
  block: Node,
  { code = false, to }: { code?: boolean; to?: number } = {},
) => {
  let text = "";
  block.forEach((child) => {
    if (child.isText) {
      const content = child.text ?? "";
      text +=
        code && child.marks.some((mark) => mark.type.name === "code")
          ? " ".repeat(content.length)
          : content;
    } else {
      text += LEAF.repeat(child.nodeSize);
    }
  });
  return to === undefined ? text : text.slice(0, to);
};

/**
 * proseText returns the text of `doc` as a reader counts it: blocks and
 * inline leaves apart by a space, without the sources of math and diagrams
 */
export const proseText = (doc: Node) => {
  const parts: string[] = [];
  doc.descendants((node) => {
    if (isSourceNode(node)) return false;
    if (node.isText) parts.push(node.text ?? "");
    else if (node.isBlock || node.isLeaf) parts.push(" ");
    return true;
  });
  return parts.join("").replace(/\s+/g, " ").trim();
};

/**
 * mathText returns the plain text of copied content that holds math, with
 * the math as markdown writes it ($x^2$, $$ on lines around display math),
 * or null for content without math
 */
export const mathText = (content: Fragment): string | null => {
  let holds = false;
  content.descendants((node) => {
    if (node.type.name.startsWith("math_")) holds = true;
    return !holds;
  });
  if (!holds) return null;
  const blocks: string[] = [];
  let line = "";
  const walk = (node: Node) => {
    if (node.type.name === "math_display") {
      if (line) blocks.push(line);
      line = "";
      blocks.push(`$$\n${node.textContent}\n$$`);
      return;
    }
    if (node.type.name === "math_inline") {
      line += inlineMarkdown(node);
      return;
    }
    if (node.isText) {
      line += node.text ?? "";
      return;
    }
    if (node.type.name === "hard_break") {
      line += "\n";
      return;
    }
    if (node.isTextblock) {
      if (line) blocks.push(line);
      line = "";
      node.forEach(walk);
      blocks.push(line);
      line = "";
      return;
    }
    node.forEach(walk);
  };
  content.forEach(walk);
  if (line) blocks.push(line);
  return blocks.join("\n\n");
};
