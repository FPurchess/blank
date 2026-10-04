import type { Node } from "prosemirror-model";
import type { Command } from "prosemirror-state";
import { TableMap } from "prosemirror-tables";

import { cellAt } from "../../../markdown/tables";
import { addColumns, addRows } from "./insert";
import { moveColumns, moveRows } from "./move";
import { repeated, selectIn, sequence, tableAt } from "./rect";
import { deleteColumns, deleteRows } from "./remove";

// Commands on the table at a position rather than the one the selection is
// in, for the mouse handles of a table: each selects what it works on and
// runs the command the toolbar and table mode run, so the same rules apply.

/**
 * selectRows selects the rows `from` to `to` (excluded) of the table at
 * `tableStart`
 */
export const selectRows = (tableStart: number, from: number, to: number) =>
  selectIn(tableStart, { top: from, bottom: to });

/**
 * selectColumns selects the columns `from` to `to` (excluded) of the table
 * at `tableStart`
 */
export const selectColumns = (tableStart: number, from: number, to: number) =>
  selectIn(tableStart, { left: from, right: to });

/**
 * insertRowAt inserts a row into the table at `tableStart` so it becomes row
 * `index`
 */
export const insertRowAt = (tableStart: number, index: number): Command =>
  index === 0
    ? sequence([selectRows(tableStart, 0, 1), addRows("above")])
    : sequence([selectRows(tableStart, index - 1, index), addRows("below")]);

/**
 * insertColumnAt inserts a column into the table at `tableStart` so it
 * becomes column `index`
 */
export const insertColumnAt = (tableStart: number, index: number): Command =>
  index === 0
    ? sequence([selectColumns(tableStart, 0, 1), addColumns("left")])
    : sequence([
        selectColumns(tableStart, index - 1, index),
        addColumns("right"),
      ]);

/**
 * moveRowsBy moves the rows `from` to `to` (excluded) of the table at
 * `tableStart` by `by` rows, up for a negative number, as far as they can go
 */
export const moveRowsBy = (
  tableStart: number,
  from: number,
  to: number,
  by: number,
): Command =>
  sequence([
    selectRows(tableStart, from, to),
    repeated(moveRows(by < 0 ? -1 : 1), Math.abs(by)),
  ]);

/**
 * moveColumnsBy moves the columns `from` to `to` (excluded) of the table at
 * `tableStart` by `by` columns, left for a negative number, as far as they
 * can go
 */
export const moveColumnsBy = (
  tableStart: number,
  from: number,
  to: number,
  by: number,
): Command =>
  sequence([
    selectColumns(tableStart, from, to),
    repeated(moveColumns(by < 0 ? -1 : 1), Math.abs(by)),
  ]);

/**
 * isEmptyCell tells whether `cell` holds nothing but an empty paragraph
 */
const isEmptyCell = (cell: Node) =>
  cell.childCount === 1 && cell.firstChild!.content.size === 0;

/**
 * smallestSize returns how few columns and rows `table` can shrink to by
 * dropping empty columns and rows at its end, keeping one of each
 */
export const smallestSize = (table: Node) => {
  const map = TableMap.get(table);
  let cols = 1;
  let rows = 1;
  for (let row = 0; row < map.height; row++) {
    for (let col = 0; col < map.width; col++) {
      if (!isEmptyCell(table.nodeAt(cellAt(map, row, col))!)) {
        cols = Math.max(cols, col + 1);
        rows = Math.max(rows, row + 1);
      }
    }
  }
  return { cols, rows };
};

/**
 * resizeTable makes the table at `tableStart` `cols` columns wide and `rows`
 * rows high, adding columns and rows at its end, or dropping them there as
 * far as they are empty, see smallestSize
 */
export const resizeTable =
  (tableStart: number, cols: number, rows: number): Command =>
  (state, dispatch) => {
    const table = tableAt(state.doc, tableStart);
    if (!table) return false;
    const { width, height } = TableMap.get(table);
    const smallest = smallestSize(table);
    const targetCols = Math.max(cols, smallest.cols);
    const targetRows = Math.max(rows, smallest.rows);
    const steps: Command[] = [];
    if (targetRows > height) {
      steps.push(
        selectRows(tableStart, height - 1, height),
        repeated(addRows("below"), targetRows - height),
      );
    } else if (targetRows < height) {
      steps.push(selectRows(tableStart, targetRows, height), deleteRows);
    }
    if (targetCols > width) {
      steps.push(
        selectColumns(tableStart, width - 1, width),
        repeated(addColumns("right"), targetCols - width),
      );
    } else if (targetCols < width) {
      steps.push(selectColumns(tableStart, targetCols, width), deleteColumns);
    }
    return steps.length > 0 && sequence(steps)(state, dispatch);
  };
