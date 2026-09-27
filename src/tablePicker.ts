import { place } from "./popup";
import { uiRoot } from "./uiRoot";
import { tablePicker, type TablePickerState } from "./state";
import {
  choosePickerSize,
  MAX_SIZE,
  sizeLabel,
} from "./editor/commands/table/pickerSize";

const PICKER_ID = "table-picker";
// the grid shows at least this many columns and rows, like Word's
const MIN_SHOWN = { cols: 10, rows: 8 };

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
    if (cell)
      choosePickerSize(Number(cell.dataset.col), Number(cell.dataset.row));
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
  const unsubscribe = tablePicker.subscribe(
    (picker) => {
      if (!picker) {
        element?.remove();
        element = anchor = null;
        return;
      }
      if (!element) {
        element = createPicker();
        uiRoot().append(element);
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
  return () => {
    unsubscribe();
    element?.remove();
    element = anchor = null;
  };
};
