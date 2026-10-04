import type { Node, ResolvedPos } from "prosemirror-model";
import { findTable, TableMap } from "prosemirror-tables";

import { schema } from "../../../markdown";

/**
 * isCell tells whether `node` is a table cell or header cell
 */
export const isCell = (node: Node) =>
  node.type === schema.nodes.table_cell ||
  node.type === schema.nodes.table_header;

/**
 * cellDepth returns the depth of the innermost cell around `$pos`, or -1 if
 * `$pos` isn't in a table
 */
export const cellDepth = ($pos: ResolvedPos): number => {
  for (let depth = $pos.depth; depth > 0; depth--) {
    if (isCell($pos.node(depth))) return depth;
  }
  return -1;
};

/**
 * inCell tells whether `$pos` is inside a table cell, at any depth
 */
export const inCell = ($pos: ResolvedPos) => cellDepth($pos) > 0;

/**
 * plainCell tells whether `$pos` is in plain cell text: a paragraph right
 * inside a cell, not in a list, quote or code block in it
 */
export const plainCell = ($pos: ResolvedPos) =>
  $pos.depth > 1 &&
  $pos.parent.type === schema.nodes.paragraph &&
  isCell($pos.node($pos.depth - 1));

export interface TableAt {
  // the table node and the position before it
  node: Node;
  pos: number;
  // the position of its first row, which TableMap positions are relative to
  start: number;
  map: TableMap;
  // the depth of the table
  depth: number;
}

/**
 * tableAround returns the innermost table around `$pos`, if any
 */
export const tableAround = ($pos: ResolvedPos): TableAt | undefined => {
  const table = findTable($pos);
  return table ? { ...table, map: TableMap.get(table.node) } : undefined;
};

/**
 * keepsParagraphAfter tells whether Blank keeps a paragraph after the child
 * at `index` of `parent`, a table or the paragraph after one: when nothing
 * follows it, or a table does
 */
export const keepsParagraphAfter = (parent: Node, index: number) =>
  index + 1 >= parent.childCount ||
  parent.child(index + 1).type === schema.nodes.table;

/**
 * isEmptyTable tells whether no cell of `table` holds any text or image
 */
export const isEmptyTable = (table: Node) => {
  let empty = true;
  table.descendants((node) => {
    if (!empty) return false;
    if (node.isText || node.type === schema.nodes.image) empty = false;
    return empty;
  });
  return empty;
};

/**
 * textblockRange returns the position of the start of the first textblock
 * and the end of the last textblock in `node`, which starts at `start`
 */
export const textblockRange = (
  node: Node,
  start: number,
): { from: number; to: number } | undefined => {
  let from: number | undefined;
  let to: number | undefined;
  node.descendants((child, pos) => {
    if (!child.isTextblock) return true;
    from ??= start + pos + 1;
    to = start + pos + 1 + child.content.size;
    return false;
  });
  return from === undefined || to === undefined ? undefined : { from, to };
};
