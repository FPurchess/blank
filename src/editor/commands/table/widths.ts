import type { Command } from "prosemirror-state";
import { isInTable, selectedRect, TableMap } from "prosemirror-tables";

import { cellWidths, columnPercents } from "../../../markdown/tables";
import { tableAt } from "./rect";

/**
 * setColumnWidths gives the columns of the table at `tableStart` the widths
 * `percents`, or lets them size to their content again for null. Widths make
 * the table an HTML table, see gfmBlocker.
 */
export const setColumnWidths =
  (tableStart: number, percents: readonly number[] | null): Command =>
  (state, dispatch) => {
    const table = tableAt(state.doc, tableStart);
    if (!table) return false;
    if (percents && percents.length !== TableMap.get(table).width) {
      return false;
    }
    if (dispatch) {
      const widths = cellWidths(table, percents);
      const tr = state.tr;
      for (const [offset, colwidth] of widths) {
        tr.setNodeAttribute(tableStart + offset, "colwidth", colwidth);
      }
      dispatch(tr);
    }
    return true;
  };

/**
 * resetColumnWidths lets the columns of the table the selection is in size
 * to their content again
 */
export const resetColumnWidths: Command = (state, dispatch) => {
  if (!isInTable(state)) return false;
  const { table, tableStart } = selectedRect(state);
  if (!columnPercents(table)) return false;
  return setColumnWidths(tableStart, null)(state, dispatch);
};
