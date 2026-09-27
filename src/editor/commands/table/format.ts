import type { Command, Transaction } from "prosemirror-state";
import {
  CellSelection,
  isInTable,
  mergeCells,
  selectedRect,
  splitCell,
  type TableRect,
} from "prosemirror-tables";

import { type Alignment, isHeaderCell, schema } from "../../../markdown";
import { cellPos, cellsOfColumns, hasHeaderColumn } from "./rect";

/**
 * alignColumns aligns the selected columns, header included, as markdown
 * aligns whole columns. If they are aligned that way already, they go back to
 * the default alignment.
 */
export const alignColumns =
  (align: Alignment): Command =>
  (state, dispatch) => {
    if (!isInTable(state)) return false;
    const rect = selectedRect(state);
    if (!dispatch) return true;
    const cells = cellsOfColumns(rect, rect.left, rect.right);
    const aligned = cells.every(
      (pos) => state.doc.nodeAt(pos)!.attrs.align === align,
    );
    const tr = state.tr;
    for (const pos of cells) {
      tr.setNodeAttribute(pos, "align", aligned ? null : align);
    }
    dispatch(tr);
    return true;
  };

/**
 * hasHeaderRow tells whether the first row of `rect`'s table is a header row
 */
export const hasHeaderRow = (rect: TableRect) =>
  rect.table.firstChild!.children.every(isHeaderCell);

/**
 * setHeaders makes the cells of the first row and the first column header
 * cells or plain cells, for a header row (`row`) and a header column (`col`).
 * The corner cell is a header cell if either is on.
 */
const setHeaders = (
  tr: Transaction,
  rect: TableRect,
  { row, col }: { row: boolean; col: boolean },
) => {
  const { map } = rect;
  const done = new Set<number>();
  const set = (r: number, c: number) => {
    const pos = cellPos(rect, r, c);
    if (done.has(pos)) return;
    done.add(pos);
    const header = (row && r === 0) || (col && c === 0);
    const type = header ? schema.nodes.table_header : schema.nodes.table_cell;
    const cell = tr.doc.nodeAt(pos)!;
    if (cell.type !== type) tr.setNodeMarkup(pos, type, cell.attrs);
  };
  for (let c = 0; c < map.width; c++) set(0, c);
  for (let r = 1; r < map.height; r++) set(r, 0);
};

/**
 * toggleHeaderRow makes the first row a header row, or a plain row again
 */
export const toggleHeaderRow: Command = (state, dispatch) => {
  if (!isInTable(state)) return false;
  const rect = selectedRect(state);
  if (dispatch) {
    const tr = state.tr;
    setHeaders(tr, rect, {
      row: !hasHeaderRow(rect),
      col: hasHeaderColumn(rect),
    });
    dispatch(tr);
  }
  return true;
};

/**
 * toggleHeaderColumn makes the first column a header column, or a plain
 * column again
 */
export const toggleHeaderColumn: Command = (state, dispatch) => {
  if (!isInTable(state)) return false;
  const rect = selectedRect(state);
  if (rect.map.height < 2) return false;
  if (dispatch) {
    const tr = state.tr;
    setHeaders(tr, rect, {
      row: hasHeaderRow(rect),
      col: !hasHeaderColumn(rect),
    });
    dispatch(tr);
  }
  return true;
};

/**
 * canMerge tells whether several cells are selected, which can be merged
 */
export const canMerge: Command = (state) =>
  state.selection instanceof CellSelection && mergeCells(state);

/**
 * mergeOrSplit merges the selected cells into one, keeping the content of
 * each, or splits the merged cell at the cursor back into single cells
 */
export const mergeOrSplit: Command = (state, dispatch) =>
  canMerge(state) ? mergeCells(state, dispatch) : splitCell(state, dispatch);

/**
 * setCaption gives the table the selection is in the caption `text`, or
 * removes its caption if `text` is empty
 */
export const setCaption =
  (text: string): Command =>
  (state, dispatch) => {
    if (!isInTable(state)) return false;
    if (dispatch) {
      const pos = selectedRect(state).tableStart - 1;
      const caption = text.replace(/\s+/g, " ").trim() || null;
      dispatch(state.tr.setNodeAttribute(pos, "caption", caption));
    }
    return true;
  };
