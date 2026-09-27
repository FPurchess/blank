import { tablePicker, type TablePickerState } from "./state";

const PICKER_ID = "table-picker";
// the largest table the picker offers
export const MAX_SIZE = 20;
// the size the picker opens with: three columns, a header row and two rows
export const DEFAULT_SIZE = { cols: 3, rows: 3 };
// space between the picker and the edges of the window
const MARGIN = 4;

/**
 * resizePicker changes the size the open picker would insert by `cols` and
 * `rows`, between 1×1 and MAX_SIZE×MAX_SIZE
 */
export const resizePicker = (cols: number, rows: number) => {
  const picker = tablePicker.value;
  if (!picker) return;
  const clamp = (n: number) => Math.min(Math.max(n, 1), MAX_SIZE);
  tablePicker.value = {
    ...picker,
    cols: clamp(picker.cols + cols),
    rows: clamp(picker.rows + rows),
  };
};

/**
 * sizeLabel describes a table size for the picker and screen readers
 */
export const sizeLabel = (cols: number, rows: number) => `${cols} × ${rows}`;

/**
 * place positions the picker below the cursor, or above it if there's no
 * room below
 */
const place = (element: HTMLElement, anchor: TablePickerState["anchor"]) => {
  const { width, height } = element.getBoundingClientRect();
  let top = anchor.bottom + 4;
  if (top + height > window.innerHeight - MARGIN) {
    top = Math.max(MARGIN, anchor.top - height - 4);
  }
  const left = Math.max(
    MARGIN,
    Math.min(anchor.left, window.innerWidth - MARGIN - width),
  );
  element.style.left = `${left}px`;
  element.style.top = `${top}px`;
};

/**
 * renderPicker renders the grid of the table picker: the cells of the chosen
 * size are marked, and one more column and row than chosen are shown
 */
const renderPicker = (picker: TablePickerState): HTMLElement => {
  const element = document.createElement("div");
  element.id = PICKER_ID;
  element.className = "table-picker";
  element.setAttribute("role", "dialog");
  element.setAttribute("aria-label", "Insert table");

  const shownCols = Math.min(Math.max(picker.cols + 1, 5), MAX_SIZE);
  const shownRows = Math.min(Math.max(picker.rows + 1, 5), MAX_SIZE);
  const grid = document.createElement("div");
  grid.className = "grid";
  grid.style.gridTemplateColumns = `repeat(${shownCols}, auto)`;
  for (let row = 1; row <= shownRows; row++) {
    for (let col = 1; col <= shownCols; col++) {
      const cell = document.createElement("span");
      cell.className = "cell";
      if (row === 1) cell.classList.add("header");
      if (col <= picker.cols && row <= picker.rows) {
        cell.classList.add("chosen");
      }
      // the mouse can choose a size too
      cell.addEventListener("mousedown", (event) => event.preventDefault());
      cell.addEventListener("mouseenter", () => {
        const open = tablePicker.value;
        if (open && (open.cols !== col || open.rows !== row)) {
          tablePicker.value = { ...open, cols: col, rows: row };
        }
      });
      cell.addEventListener("click", () => picker.submit(col, row));
      grid.appendChild(cell);
    }
  }

  const label = document.createElement("div");
  label.className = "size";
  label.setAttribute("aria-live", "polite");
  label.textContent = sizeLabel(picker.cols, picker.rows);

  const hint = document.createElement("div");
  hint.className = "hint";
  hint.textContent = "Arrows: size · Enter: insert · Esc: cancel";

  element.append(grid, label, hint);
  return element;
};

/**
 * bootTablePicker renders the table picker whenever it opens or changes
 */
export const bootTablePicker = () => {
  tablePicker.subscribe(
    (picker) => {
      document.getElementById(PICKER_ID)?.remove();
      if (!picker) return;
      const element = renderPicker(picker);
      document.body.appendChild(element);
      place(element, picker.anchor);
    },
    { immediate: true },
  );
};
