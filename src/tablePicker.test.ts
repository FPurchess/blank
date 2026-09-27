import { afterEach, describe, expect, it, vi } from "vitest";

import { tablePicker, type TablePickerState } from "./state";
import { bootTablePicker } from "./tablePicker";
import { resizePicker } from "./editor/commands/table/pickerSize";

const open = (cols = 3, rows = 3): TablePickerState => {
  const picker: TablePickerState = {
    cols,
    rows,
    anchor: { left: 10, top: 20, bottom: 30 },
    submit: vi.fn(),
    cancel: vi.fn(),
  };
  tablePicker.value = picker;
  return picker;
};

const element = () => document.getElementById("table-picker")!;
const cells = () => [...element().querySelectorAll<HTMLElement>(".cell")];
const cellAt = (col: number, row: number) =>
  element().querySelector<HTMLElement>(
    `.cell[data-col="${col}"][data-row="${row}"]`,
  )!;

describe("tablePicker", () => {
  let dispose = bootTablePicker();

  afterEach(() => {
    tablePicker.value = null;
  });

  it("removes the picker and stops rendering when disposed", () => {
    open(3, 3);
    dispose();

    expect(document.getElementById("table-picker")).toBeNull();
    open(3, 3);
    expect(document.getElementById("table-picker")).toBeNull();
    tablePicker.value = null;
    dispose = bootTablePicker();
  });

  it("shows the chosen size in a grid of at least 10 × 8", () => {
    open(6, 2);

    expect(element().getAttribute("role")).toBe("dialog");
    expect(cells()).toHaveLength(10 * 8);
    expect(element().querySelectorAll(".cell.chosen")).toHaveLength(12);
    expect(element().querySelector(".size")!.textContent).toBe("6 × 2");
  });

  it("grows the grid one past the chosen size, up to 20", () => {
    open(12, 8);
    expect(cells()).toHaveLength(13 * 9);

    resizePicker(20, 20);
    expect(cells()).toHaveLength(20 * 20);
  });

  it("changes the size in place, without rendering the picker again", () => {
    open();
    const first = element();
    const firstCell = cells()[0];
    resizePicker(1, 0);

    expect(element()).toBe(first);
    expect(cells()[0]).toBe(firstCell);
    expect(cellAt(4, 1).classList.contains("chosen")).toBe(true);
  });

  it("chooses the size under the mouse and inserts it on a click", () => {
    const picker = open();
    cellAt(4, 2).dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));

    expect(tablePicker.value).toMatchObject({ cols: 4, rows: 2 });
    cellAt(4, 2).click();
    expect(picker.submit).toHaveBeenCalledWith(4, 2);
  });

  it("keeps the focus in the editor when it's pressed anywhere", () => {
    open();
    const press = (target: Element) => {
      const event = new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
      });
      target.dispatchEvent(event);
      return event.defaultPrevented;
    };

    expect(press(cellAt(1, 1))).toBe(true);
    expect(press(document.querySelector("#table-picker .size")!)).toBe(true);
  });

  it("is removed once closed", () => {
    open();
    tablePicker.value = null;

    expect(document.getElementById("table-picker")).toBeNull();
  });
});
