import type { Node } from "prosemirror-model";
import { Transform } from "prosemirror-transform";

// How paragraphs and headings are aligned: left, the default, isn't stored,
// so `align` is null or one of the others. Only blocks at the top of the
// document keep an alignment, which markdown writes as a <div align> around
// them; nested ones (in lists, quotes, cells and form fields) don't, so what
// shows is what gets saved.

/**
 * oneOf returns a reader of the alignment a value names, e.g. from `align`
 * or `text-align`, if it is one of `values`, null otherwise
 */
export const oneOf =
  <T extends string>(values: readonly T[]) =>
  (value: unknown): T | null => {
    const lower = typeof value === "string" ? value.trim().toLowerCase() : "";
    return (values as readonly string[]).includes(lower) ? (lower as T) : null;
  };

const STORED = ["center", "right", "justify"] as const;

export type TextAlignment = (typeof STORED)[number];

/**
 * textAlignment returns the alignment `value` names, null for left and
 * anything else
 */
export const textAlignment = oneOf(STORED);

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
 * nestedAlignment visits the nodes of `doc` (as nodesBetween does) and calls
 * `found` with the position of each aligned textblock that isn't directly in
 * it, e.g. a paragraph in a list, which keeps no alignment
 */
export const nestedAlignment =
  (doc: Node, found: (pos: number) => void) =>
  (node: Node, pos: number, parent: Node | null) => {
    if (!node.isTextblock) return true;
    if (parent !== doc && node.attrs.align) found(pos);
    return false;
  };

/**
 * withoutNestedAlignment returns `doc` without the alignment of the
 * textblocks that aren't directly in it
 */
export const withoutNestedAlignment = (doc: Node): Node => {
  const positions: number[] = [];
  doc.descendants(nestedAlignment(doc, (pos) => positions.push(pos)));
  if (positions.length === 0) return doc;
  const tr = new Transform(doc);
  for (const pos of positions) tr.setNodeAttribute(pos, "align", null);
  return tr.doc;
};
