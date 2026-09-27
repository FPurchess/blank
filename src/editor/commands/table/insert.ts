import type { Node } from "prosemirror-model";
import { TextSelection, type Command } from "prosemirror-state";
import {
  addColumn,
  addRow,
  isInTable,
  selectedRect,
  type TableRect,
} from "prosemirror-tables";

import { type Alignment, headerRowCount, schema } from "../../../markdown";
import { inCell } from "../../plugins/tables/util";
import { cellPos, hasHeaderColumn, refreshed, selectCells } from "./rect";

/**
 * createTable returns an empty table of `cols` columns and `rows` rows, the
 * first of which is the header row
 */
export const createTable = (cols: number, rows: number): Node => {
  const { table, table_row, table_header, table_cell } = schema.nodes;
  const row = (type: typeof table_cell) =>
    table_row.create(
      null,
      Array.from({ length: cols }, () => type.createAndFill()!),
    );
  return table.create(null, [
    row(table_header),
    ...Array.from({ length: rows - 1 }, () => row(table_cell)),
  ]);
};

/**
 * insertTable inserts an empty table of `cols` × `rows` with a header row and
 * puts the cursor in its first cell. It replaces an empty paragraph and goes
 * after the block at the cursor otherwise. Tables can't go into cells.
 */
export const insertTable =
  (cols: number, rows: number): Command =>
  (state, dispatch) => {
    const { $from } = state.selection;
    if (inCell($from) || !$from.parent.isTextblock) return false;

    const node = createTable(cols, rows);
    const empty =
      $from.parent.type === schema.nodes.paragraph &&
      $from.parent.content.size === 0;
    const container = $from.node(-1);
    const index = $from.index(-1);
    const fits = empty
      ? container.canReplaceWith(index, index + 1, node.type)
      : container.canReplaceWith(index + 1, index + 1, node.type);
    if (!fits) return false;

    if (dispatch) {
      const tr = state.tr;
      const pos = empty ? $from.before() : $from.after();
      if (empty) tr.replaceWith(pos, $from.after(), node);
      else tr.insert(pos, node);
      // table, row, cell and paragraph open before the first cell's text
      tr.setSelection(TextSelection.create(tr.doc, pos + 4));
      dispatch(tr.scrollIntoView());
    }
    return true;
  };

/**
 * addRows adds as many rows as are selected above or below them, and selects
 * the new rows. They take the alignment of their columns. Nothing goes above
 * the header row, which stays on top.
 */
export const addRows =
  (side: "above" | "below"): Command =>
  (state, dispatch) => {
    if (!isInTable(state)) return false;
    let rect = selectedRect(state);
    const { top, bottom, left } = rect;
    if (side === "above" && top < headerRowCount(rect.table)) return false;
    if (!dispatch) return true;

    const count = bottom - top;
    const at = side === "above" ? top : bottom;
    // the row whose alignment the new rows take
    const reference = side === "above" ? top : bottom - 1;
    const aligns = columnAligns(rect, reference);
    const tr = state.tr;
    for (let i = 0; i < count; i++) {
      addRow(tr, rect, at);
      rect = refreshed(tr, rect);
    }
    for (let row = at; row < at + count; row++) {
      for (let col = 0; col < rect.map.width; col++) {
        // cells merged across the new rows keep their own alignment
        if (aligns[col] && isNew(rect, row, col)) {
          tr.setNodeAttribute(cellPos(rect, row, col), "align", aligns[col]);
        }
      }
    }
    dispatch(
      selectCells(tr, rect, {
        top: at,
        bottom: at + count,
        left: count > 1 ? 0 : left,
        right: count > 1 ? rect.map.width : left + 1,
      }).scrollIntoView(),
    );
    return true;
  };

/**
 * addColumns adds as many columns as are selected left or right of them, and
 * selects the new columns. Nothing goes left of a header column.
 */
export const addColumns =
  (side: "left" | "right"): Command =>
  (state, dispatch) => {
    if (!isInTable(state)) return false;
    const rect = selectedRect(state);
    const { top, left, right } = rect;
    if (side === "left" && left === 0 && hasHeaderColumn(rect)) return false;
    if (!dispatch) return true;

    const count = right - left;
    const at = side === "left" ? left : right;
    const tr = state.tr;
    // unlike addRow, addColumn maps the table it gets through all steps of
    // the transaction, so it gets the table as it was before them each time
    for (let i = 0; i < count; i++) addColumn(tr, rect, at);
    dispatch(
      selectCells(tr, rect, {
        top: count > 1 ? 0 : top,
        bottom: count > 1 ? rect.map.height : top + 1,
        left: at,
        right: at + count,
      }).scrollIntoView(),
    );
    return true;
  };

/**
 * columnAligns returns the alignment of each column in `row`
 */
const columnAligns = (rect: TableRect, row: number) =>
  Array.from(
    { length: rect.map.width },
    (_, col) =>
      rect.table.nodeAt(rect.map.map[row * rect.map.width + col])!.attrs
        .align as Alignment | null,
  );

/**
 * isNew tells whether the cell at `row` and `col` starts in that row, rather
 * than being a cell above merged into it
 */
const isNew = (rect: TableRect, row: number, col: number) =>
  row === 0 ||
  rect.map.map[row * rect.map.width + col] !==
    rect.map.map[(row - 1) * rect.map.width + col];
