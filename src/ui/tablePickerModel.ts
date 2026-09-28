import { MAX_SIZE } from "../editor/commands/table/pickerSize";
import type { TablePickerState } from "../state";

// the grid shows at least this many columns and rows, like Word's
const MIN_SHOWN = { cols: 10, rows: 8 };

/**
 * shownSize returns how many columns and rows the grid shows for `picker`:
 * at least MIN_SHOWN, and always one more than chosen, so the mouse can grow
 * it, but never more than MAX_SIZE
 */
export const shownSize = ({ cols, rows }: TablePickerState) => ({
  cols: Math.min(Math.max(cols + 1, MIN_SHOWN.cols), MAX_SIZE),
  rows: Math.min(Math.max(rows + 1, MIN_SHOWN.rows), MAX_SIZE),
});

export interface PickerCell {
  // keeps a cell the same element while the grid grows
  key: string;
  col: number;
  row: number;
}

/**
 * pickerCells returns the cells of a grid of `cols` × `rows`, row by row
 */
export const pickerCells = (cols: number, rows: number): PickerCell[] => {
  const cells: PickerCell[] = [];
  for (let row = 1; row <= rows; row++) {
    for (let col = 1; col <= cols; col++) {
      cells.push({ key: `${col}-${row}`, col, row });
    }
  }
  return cells;
};
