import { Selection, type Command, type EditorState } from "prosemirror-state";
import {
  isInTable,
  removeColumn,
  removeRow,
  selectedRect,
  type TableRect,
} from "prosemirror-tables";

import { schema } from "../../../markdown";
import {
  cellPos,
  hasHeaderRow,
  refreshed,
  selectCells,
  setCellType,
} from "./rect";

/**
 * removeTable removes the table of `rect` and puts the cursor where it was
 */
export const removeTable = (state: EditorState, rect: TableRect) => {
  const tr = state.tr;
  const pos = rect.tableStart - 1;
  const end = pos + rect.table.nodeSize;
  // a document or container can't be left empty
  if (tr.doc.resolve(pos).parent.childCount === 1) {
    tr.replaceWith(pos, end, schema.nodes.paragraph.create());
  } else {
    tr.delete(pos, end);
  }
  return tr.setSelection(Selection.near(tr.doc.resolve(pos))).scrollIntoView();
};

/**
 * deleteTable removes the table the selection is in
 */
export const deleteTable: Command = (state, dispatch) => {
  if (!isInTable(state)) return false;
  if (dispatch) dispatch(removeTable(state, selectedRect(state)));
  return true;
};

/**
 * deleteRows removes the selected rows, or the table if they are all of it.
 * When the header row goes, the row below becomes the header, so the table
 * keeps one.
 */
export const deleteRows: Command = (state, dispatch) => {
  if (!isInTable(state)) return false;
  let rect = selectedRect(state);
  const { top, bottom, left } = rect;
  if (!dispatch) return true;
  if (bottom - top === rect.map.height) {
    dispatch(removeTable(state, rect));
    return true;
  }

  const hadHeader = hasHeaderRow(rect);
  const tr = state.tr;
  for (let row = bottom - 1; row >= top; row--) {
    removeRow(tr, rect, row);
    rect = refreshed(tr, rect);
  }
  if (top === 0 && hadHeader) {
    for (let col = 0; col < rect.map.width; col++) {
      setCellType(tr, cellPos(rect, 0, col), schema.nodes.table_header);
    }
  }
  const row = Math.min(top, rect.map.height - 1);
  const col = Math.min(left, rect.map.width - 1);
  dispatch(
    selectCells(tr, rect, {
      top: row,
      bottom: row + 1,
      left: col,
      right: col + 1,
    }).scrollIntoView(),
  );
  return true;
};

/**
 * deleteColumns removes the selected columns, or the table if they are all
 * of it
 */
export const deleteColumns: Command = (state, dispatch) => {
  if (!isInTable(state)) return false;
  let rect = selectedRect(state);
  const { top, left, right } = rect;
  if (!dispatch) return true;
  if (right - left === rect.map.width) {
    dispatch(removeTable(state, rect));
    return true;
  }

  const tr = state.tr;
  for (let col = right - 1; col >= left; col--) {
    removeColumn(tr, rect, col);
    rect = refreshed(tr, rect);
  }
  const col = Math.min(left, rect.map.width - 1);
  dispatch(
    selectCells(tr, rect, {
      top,
      bottom: top + 1,
      left: col,
      right: col + 1,
    }).scrollIntoView(),
  );
  return true;
};
