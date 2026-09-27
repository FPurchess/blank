import { tablePicker } from "../../../state";

// the largest table the picker offers
export const MAX_SIZE = 20;
// the size the picker opens with: three columns, a header row and two rows
export const DEFAULT_SIZE = { cols: 3, rows: 3 };

/**
 * resizePicker changes the size the open picker would insert by `cols` and
 * `rows`, between 1×1 and MAX_SIZE×MAX_SIZE
 */
export const resizePicker = (cols: number, rows: number) => {
  const picker = tablePicker.value;
  if (!picker) return;
  choosePickerSize(picker.cols + cols, picker.rows + rows);
};

/**
 * choosePickerSize sets the size the open picker would insert
 */
export const choosePickerSize = (cols: number, rows: number) => {
  const picker = tablePicker.value;
  const clamp = (n: number) => Math.min(Math.max(n, 1), MAX_SIZE);
  if (!picker || (picker.cols === clamp(cols) && picker.rows === clamp(rows))) {
    return;
  }
  tablePicker.value = { ...picker, cols: clamp(cols), rows: clamp(rows) };
};

/**
 * sizeLabel describes a table size for the picker and screen readers
 */
export const sizeLabel = (cols: number, rows: number) => `${cols} × ${rows}`;
