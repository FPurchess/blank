import type { Node } from "prosemirror-model";
import { Plugin, type EditorState, type Transaction } from "prosemirror-state";

import { schema } from "../../../markdown";
import { CELL_SEPARATOR } from "../../../markdown/html";
import { changedDescendants } from "../changed";
import { keepsParagraphAfter, standsApart } from "./util";

/**
 * flattened returns what replaces a node a cell can't hold: a heading becomes
 * a paragraph, a rule or page break an empty paragraph, a table one
 * paragraph per row
 */
const flattened = (node: Node): Node[] => {
  const { paragraph } = schema.nodes;
  if (node.type === schema.nodes.heading) {
    return [paragraph.create(null, node.content, node.marks)];
  }
  if (node.type !== schema.nodes.table) return [paragraph.create()];
  return node.children.map((row) => {
    const text = row.children
      .map((cell) => cell.textBetween(0, cell.content.size, " ", " ").trim())
      .join(CELL_SEPARATOR);
    return paragraph.create(null, text ? schema.text(text) : null);
  });
};

const outOfPlace = (node: Node) =>
  node.type === schema.nodes.table ||
  node.type === schema.nodes.heading ||
  node.type === schema.nodes.horizontal_rule ||
  node.type === schema.nodes.page_break;

/**
 * cleanCells replaces the tables, headings and rules that got into cells,
 * e.g. through a list or quote in a cell, whose content is `block+`
 */
const cleanCells = (tr: Transaction, old: Node, doc: Node) => {
  const found: { node: Node; pos: number }[] = [];
  changedDescendants(old, doc, 0, (node, pos) => {
    if (node.type !== schema.nodes.table) return !node.isTextblock;
    node.descendants((child, childPos) => {
      if (outOfPlace(child)) {
        found.push({ node: child, pos: pos + 1 + childPos });
        return false;
      }
      return !child.isTextblock;
    });
    return false;
  });
  for (const { node, pos } of found.reverse()) {
    tr.replaceWith(pos, pos + node.nodeSize, flattened(node));
  }
};

/**
 * keepParagraphs puts an empty paragraph after a table or content block that
 * ends the document, before one that starts it and between two of them, so
 * the cursor can always get out of a table, or past a block, with the
 * keyboard and the mouse
 */
const keepParagraphs = (tr: Transaction) => {
  const { doc } = tr;
  const { paragraph } = schema.nodes;
  const missing: number[] = [];
  doc.forEach((node, offset, index) => {
    if (!standsApart(node)) return;
    if (index === 0) missing.push(0);
    if (keepsParagraphAfter(doc, index)) missing.push(offset + node.nodeSize);
  });
  for (const at of missing.reverse()) tr.insert(at, paragraph.create());
};

/**
 * tableGuard keeps tables well placed: no table, heading or rule inside a
 * cell, and a paragraph next to tables and content blocks at the edges of
 * the document
 */
export const tableGuard = () =>
  new Plugin({
    appendTransaction(
      transactions: readonly Transaction[],
      oldState: EditorState,
      state: EditorState,
    ) {
      const tr = state.tr;
      if (transactions.some((t) => t.docChanged)) {
        cleanCells(tr, oldState.doc, state.doc);
      }
      keepParagraphs(tr);
      if (!tr.docChanged) return null;
      // the fixes aren't steps of their own to undo
      return tr.setMeta("addToHistory", false);
    },
  });
