import {
  Selection,
  TextSelection,
  type Command,
  type EditorState,
  type Transaction,
} from "prosemirror-state";
import type { Node, NodeType } from "prosemirror-model";
import { CellSelection, TableMap, type TableRect } from "prosemirror-tables";

import { headerRowCount, isHeaderCell } from "../../../markdown";
import { cellAt } from "../../../markdown/tables";

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
 * cellPos returns the document position of the cell at `row` and `col` of
 * the table `rect` describes
 */
export const cellPos = (rect: TableRect, row: number, col: number) =>
  rect.tableStart + cellAt(rect.map, row, col);

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
 * setCellType turns the cell at `pos` in `tr` into a cell of `type` (a header
 * cell or a plain cell), keeping its content and attributes
 */
export const setCellType = (tr: Transaction, pos: number, type: NodeType) => {
  const cell = tr.doc.nodeAt(pos)!;
  if (cell.type !== type) tr.setNodeMarkup(pos, type, cell.attrs);
};

/**
 * hasHeaderRow tells whether the first row of `rect`'s table is a header row
 */
export const hasHeaderRow = (rect: TableRect) => headerRowCount(rect.table) > 0;

/**
 * hasHeaderColumn tells whether the first column of `rect`'s table holds
 * header cells below the header rows, as a header column does
 */
export const hasHeaderColumn = (rect: TableRect) => {
  const { map, table } = rect;
  const body = headerRowCount(table);
  if (body >= map.height) return false;
  for (let row = body; row < map.height; row++) {
    if (!isHeaderCell(table.nodeAt(cellAt(map, row, 0)))) return false;
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
 * tableAt returns the table that starts at `tableStart` (inside the table
 * node) in `doc`, or null if there is none
 */
export const tableAt = (doc: Node, tableStart: number): Node | null => {
  const node = tableStart > 0 ? doc.nodeAt(tableStart - 1) : null;
  return node?.type.spec.tableRole === "table" ? node : null;
};

/**
 * tableRect returns the rect of the table that starts at `tableStart` (inside
 * the table node), with nothing selected
 */
export const tableRect = (
  state: EditorState,
  tableStart: number,
): TableRect => {
  const table = state.doc.nodeAt(tableStart - 1)!;
  return {
    table,
    tableStart,
    map: TableMap.get(table),
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  };
};

/**
 * selectIn returns a command that selects the rows `top` to `bottom` and the
 * columns `left` to `right` (ends excluded) of the table at `tableStart`, see
 * selectCells. Bounds left out cover the whole table, e.g. all columns for
 * rows.
 */
export const selectIn =
  (
    tableStart: number,
    cells: Partial<Pick<TableRect, "top" | "bottom" | "left" | "right">>,
  ): Command =>
  (state, dispatch) => {
    if (!tableAt(state.doc, tableStart)) return false;
    const rect = tableRect(state, tableStart);
    const {
      top = 0,
      bottom = rect.map.height,
      left = 0,
      right = rect.map.width,
    } = cells;
    if (top < 0 || left < 0 || bottom > rect.map.height) return false;
    if (right > rect.map.width || top >= bottom || left >= right) return false;
    dispatch?.(selectCells(state.tr, rect, { top, bottom, left, right }));
    return true;
  };

/**
 * sequence returns a command that runs `commands` one after the other in one
 * transaction, each on the state the one before left, so it's one undo step.
 * It applies if they all do, or with `partial` if at least the first does,
 * and then stops before the first that doesn't.
 */
export const sequence =
  (commands: Command[], { partial = false } = {}): Command =>
  (state, dispatch) => {
    const tr = state.tr;
    let current = state;
    let done = 0;
    for (const command of commands) {
      const next = transactionOf(command, current);
      if (!next) break;
      // with what plugins append to it, e.g. prosemirror-tables' fixes, so
      // the next command's steps fit the document
      const applied = current.applyTransaction(next);
      for (const each of applied.transactions) {
        each.steps.forEach((step) => tr.step(step));
      }
      current = applied.state;
      done++;
    }
    if (done === 0 || (!partial && done < commands.length)) return false;
    if (dispatch) {
      // the selection the last command left, in the combined transaction
      tr.setSelection(Selection.fromJSON(tr.doc, current.selection.toJSON()));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };

/**
 * repeated returns a command that runs `command` up to `times` times in one
 * transaction, as often as it applies
 */
export const repeated = (command: Command, times: number): Command =>
  sequence(Array<Command>(times).fill(command), { partial: true });

/**
 * transactionOf returns the transaction `command` would dispatch in `state`,
 * if it applies
 */
export const transactionOf = (command: Command, state: EditorState) => {
  let result: Transaction | undefined;
  command(state, (tr) => (result = tr));
  return result;
};
