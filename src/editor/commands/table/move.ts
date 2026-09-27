import type { Command } from "prosemirror-state";
import {
  isInTable,
  moveTableColumn,
  moveTableRow,
  selectedRect,
} from "prosemirror-tables";

import { headerRowCount } from "../../../markdown";
import { hasHeaderColumn, selectCells, transactionOf } from "./rect";

/**
 * moveRows moves the selected rows up (-1) or down (1) by one, by moving the
 * row next to them to their other side. Rows move within the body only, so
 * the header row stays on top.
 */
export const moveRows =
  (dir: -1 | 1): Command =>
  (state, dispatch) => {
    if (!isInTable(state)) return false;
    const rect = selectedRect(state);
    const { top, bottom } = rect;
    const body = headerRowCount(rect.table);
    const outside = dir < 0 ? top - 1 : bottom;
    if (top < body || outside < body || outside >= rect.map.height) {
      return false;
    }
    const move = moveTableRow({
      from: outside,
      to: dir < 0 ? bottom - 1 : top,
      select: false,
      pos: rect.tableStart,
    });
    const tr = transactionOf(move, state);
    if (!tr) return false;
    if (dispatch) {
      const moved = { ...rect, top: top + dir, bottom: bottom + dir };
      dispatch(selectCells(tr, rect, moved).scrollIntoView());
    }
    return true;
  };

/**
 * moveColumns moves the selected columns left (-1) or right (1) by one, by
 * moving the column next to them to their other side. A header column stays
 * first.
 */
export const moveColumns =
  (dir: -1 | 1): Command =>
  (state, dispatch) => {
    if (!isInTable(state)) return false;
    const rect = selectedRect(state);
    const { left, right } = rect;
    const outside = dir < 0 ? left - 1 : right;
    const first = hasHeaderColumn(rect) ? 1 : 0;
    if (left < first || outside < first || outside >= rect.map.width) {
      return false;
    }
    const move = moveTableColumn({
      from: outside,
      to: dir < 0 ? right - 1 : left,
      select: false,
      pos: rect.tableStart,
    });
    const tr = transactionOf(move, state);
    if (!tr) return false;
    if (dispatch) {
      const moved = { ...rect, left: left + dir, right: right + dir };
      dispatch(selectCells(tr, rect, moved).scrollIntoView());
    }
    return true;
  };
