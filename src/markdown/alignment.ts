import type { Node } from "prosemirror-model";
import { Transform } from "prosemirror-transform";

// How paragraphs and headings are aligned: left, the default, isn't stored,
// so `align` is null or one of the others. Only blocks at the top of the
// document keep an alignment, which markdown writes as a <div align> around
// them; nested ones (in lists, quotes, cells and form fields) don't, so what
// shows is what gets saved.

export type TextAlignment = "center" | "right" | "justify";

const STORED: readonly string[] = ["center", "right", "justify"];

/**
 * textAlignment returns the alignment `value` names, e.g. from `align` or
 * `text-align`; null for left and anything else
 */
export const textAlignment = (value: unknown): TextAlignment | null => {
  const lower = typeof value === "string" ? value.trim().toLowerCase() : "";
  return STORED.includes(lower) ? (lower as TextAlignment) : null;
};

/**
 * alignOf returns how `node` is aligned, or null for left. An empty paragraph
 * counts as left, since markdown writes nothing for it.
 */
export const alignOf = (node?: Node | null): TextAlignment | null => {
  if (!node || (node.type.name === "paragraph" && node.childCount === 0)) {
    return null;
  }
  return textAlignment(node.attrs.align);
};

/**
 * nestedAlignments returns the positions of the aligned textblocks between
 * `from` and `to` that aren't directly in the document
 */
export const nestedAlignments = (
  doc: Node,
  from = 0,
  to = doc.content.size,
): number[] => {
  const found: number[] = [];
  doc.nodesBetween(from, to, (node, pos, parent) => {
    if (!node.isTextblock) return true;
    if (parent !== doc && node.attrs.align) found.push(pos);
    return false;
  });
  return found;
};

/**
 * withoutNestedAlignment returns `doc` without the alignment of the
 * textblocks that aren't directly in it, e.g. a paragraph in a list
 */
export const withoutNestedAlignment = (doc: Node): Node => {
  const positions = nestedAlignments(doc);
  if (positions.length === 0) return doc;
  const tr = new Transform(doc);
  for (const pos of positions) tr.setNodeAttribute(pos, "align", null);
  return tr.doc;
};
