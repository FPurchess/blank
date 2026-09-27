import { place } from "./popup";
import { tablePicker, type TablePickerState } from "./state";

const PICKER_ID = "table-picker";
// the largest table the picker offers
export const MAX_SIZE = 20;
// the size the picker opens with: three columns, a header row and two rows
export const DEFAULT_SIZE = { cols: 3, rows: 3 };
// the grid shows at least this many columns and rows, like Word's
const MIN_SHOWN = { cols: 10, rows: 8 };

/**
 * resizePicker changes the size the open picker would insert by `cols` and
 * `rows`, between 1×1 and MAX_SIZE×MAX_SIZE
 */
export const resizePicker = (cols: number, rows: number) => {
  const picker = tablePicker.value;
  if (!picker) return;
  choose(picker.cols + cols, picker.rows + rows);
};

/**
 * choose sets the size the open picker would insert
 */
const choose = (cols: number, rows: number) => {
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

/**
 * shown returns how many columns and rows the grid shows for `picker`: at
 * least MIN_SHOWN, and always one more than chosen, so the mouse can grow it
 */
const shown = ({ cols, rows }: TablePickerState) => ({
  cols: Math.min(Math.max(cols + 1, MIN_SHOWN.cols), MAX_SIZE),
  rows: Math.min(Math.max(rows + 1, MIN_SHOWN.rows), MAX_SIZE),
});

/**
 * createPicker creates the picker: a grid whose cells choose the size under
 * the mouse and insert it on a click, the size and a hint
 */
const createPicker = (): HTMLElement => {
  const element = document.createElement("div");
  element.id = PICKER_ID;
  element.className = "table-picker";
  element.setAttribute("role", "dialog");
  element.setAttribute("aria-label", "Insert table");
  // a press anywhere on it keeps the focus in the editor, which handles keys
  element.addEventListener("mousedown", (event) => event.preventDefault());

  const grid = document.createElement("div");
  grid.className = "grid";
  // the cells touch, so there's no gap where the mouse chooses nothing
  const cellAt = (event: Event) =>
    (event.target as HTMLElement).closest<HTMLElement>(".cell");
  grid.addEventListener("mouseover", (event) => {
    const cell = cellAt(event);
    if (cell) choose(Number(cell.dataset.col), Number(cell.dataset.row));
  });
  grid.addEventListener("click", (event) => {
    const cell = cellAt(event);
    const picker = tablePicker.value;
    if (cell && picker) {
      picker.submit(Number(cell.dataset.col), Number(cell.dataset.row));
    }
  });

  const size = document.createElement("div");
  size.className = "size";
  size.setAttribute("aria-live", "polite");

  const hint = document.createElement("div");
  hint.className = "hint";
  hint.textContent = "Arrows or mouse: size · Enter or click: insert";

  element.append(grid, size, hint);
  return element;
};

/**
 * updatePicker shows the chosen size of `picker` in `element`. It changes the
 * grid in place, so nothing flickers while the size changes.
 */
const updatePicker = (element: HTMLElement, picker: TablePickerState) => {
  const grid = element.querySelector<HTMLElement>(".grid")!;
  const { cols, rows } = shown(picker);
  if (grid.childElementCount !== cols * rows) {
    grid.style.gridTemplateColumns = `repeat(${cols}, auto)`;
    const cells = [];
    for (let row = 1; row <= rows; row++) {
      for (let col = 1; col <= cols; col++) {
        const cell = document.createElement("span");
        cell.className = row === 1 ? "cell header" : "cell";
        cell.dataset.col = String(col);
        cell.dataset.row = String(row);
        cells.push(cell);
      }
    }
    grid.replaceChildren(...cells);
  }
  for (const cell of grid.children as HTMLCollectionOf<HTMLElement>) {
    const chosen =
      Number(cell.dataset.col) <= picker.cols &&
      Number(cell.dataset.row) <= picker.rows;
    cell.classList.toggle("chosen", chosen);
  }
  element.querySelector(".size")!.textContent = sizeLabel(
    picker.cols,
    picker.rows,
  );
};

/**
 * bootTablePicker shows the table picker while it's open
 */
export const bootTablePicker = () => {
  let element: HTMLElement | null = null;
  let anchor: TablePickerState["anchor"] | null = null;
  tablePicker.subscribe(
    (picker) => {
      if (!picker) {
        element?.remove();
        element = anchor = null;
        return;
      }
      if (!element) {
        element = createPicker();
        document.body.appendChild(element);
      }
      const height = element.offsetHeight;
      updatePicker(element, picker);
      // placed when it opens and when the grid grows, so it stays in view
      if (anchor !== picker.anchor || element.offsetHeight !== height) {
        anchor = picker.anchor;
        place(element, anchor);
      }
    },
    { immediate: true },
  );
};
