import {
  TextSelection,
  type Command,
  type EditorState,
  type Transaction,
} from "prosemirror-state";
import { CellSelection, TableMap, type TableRect } from "prosemirror-tables";

import { headerRowCount, isHeaderCell } from "../../../markdown";

// Helpers the table commands share, around prosemirror-tables' TableRect: the
// selected cells of a table, with the table and its map.

/**
 * refreshed returns `rect` for the table as it is in `tr`, after steps that
 * changed it, e.g. an added row
 */
export const refreshed = (tr: Transaction, rect: TableRect): TableRect => {
  const table = tr.doc.nodeAt(rect.tableStart - 1)!;
  return { ...rect, table, map: TableMap.get(table) };
};

/**
 * cellPos returns the position of the cell at `row` and `col` in `tr`
 */
export const cellPos = (rect: TableRect, row: number, col: number) =>
  rect.tableStart + rect.map.map[row * rect.map.width + col];

/**
 * selectCells selects the rows `top` to `bottom` and the columns `left` to
 * `right` of the table in `tr` (ends excluded). A single cell gets the cursor
 * instead, at the start of its text.
 */
export const selectCells = (
  tr: Transaction,
  rect: TableRect,
  {
    top,
    bottom,
    left,
    right,
  }: Pick<TableRect, "top" | "bottom" | "left" | "right">,
) => {
  const current = refreshed(tr, rect);
  const anchor = cellPos(current, top, left);
  const head = cellPos(current, bottom - 1, right - 1);
  tr.setSelection(
    anchor === head
      ? TextSelection.near(tr.doc.resolve(anchor + 1))
      : CellSelection.create(tr.doc, anchor, head),
  );
  return tr;
};

/**
 * hasHeaderColumn tells whether the first column of `rect`'s table holds
 * header cells below the header rows, as a header column does
 */
export const hasHeaderColumn = (rect: TableRect) => {
  const { map, table } = rect;
  const body = headerRowCount(table);
  if (body >= map.height) return false;
  for (let row = body; row < map.height; row++) {
    if (!isHeaderCell(table.nodeAt(map.map[row * map.width]))) return false;
  }
  return true;
};

/**
 * cellsOfColumns returns the positions of the cells that cover the columns
 * `left` to `right` (right excluded), each once
 */
export const cellsOfColumns = (rect: TableRect, left: number, right: number) =>
  rect.map
    .cellsInRect({ left, right, top: 0, bottom: rect.map.height })
    .map((offset) => rect.tableStart + offset);

/**
 * transactionOf returns the transaction `command` would dispatch in `state`,
 * if it applies
 */
export const transactionOf = (command: Command, state: EditorState) => {
  let result: Transaction | undefined;
  command(state, (tr) => (result = tr));
  return result;
};
