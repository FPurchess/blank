import { afterEach, describe, expect, it, vi } from "vitest";

import { tablePicker, type TablePickerState } from "./state";
import { bootTablePicker, resizePicker, sizeLabel } from "./tablePicker";

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

describe("tablePicker", () => {
  bootTablePicker();

  afterEach(() => {
    tablePicker.value = null;
  });

  it("renders the chosen size in a grid one larger than chosen", () => {
    open(6, 2);
    const element = document.getElementById("table-picker")!;

    expect(element.getAttribute("role")).toBe("dialog");
    expect(element.querySelectorAll(".cell")).toHaveLength(7 * 5);
    expect(element.querySelectorAll(".cell.chosen")).toHaveLength(12);
    expect(element.querySelector(".size")!.textContent).toBe("6 × 2");
  });

  it("is removed once closed", () => {
    open();
    tablePicker.value = null;

    expect(document.getElementById("table-picker")).toBeNull();
  });

  it("chooses the size under the mouse and inserts it on a click", () => {
    const picker = open();
    const cells = document.querySelectorAll<HTMLElement>("#table-picker .cell");
    // the second row's fourth cell of the five columns shown
    cells[5 + 3].dispatchEvent(new MouseEvent("mouseenter"));

    expect(tablePicker.value).toMatchObject({ cols: 4, rows: 2 });
    // still five columns shown, since four are chosen
    const rendered = document.querySelectorAll<HTMLElement>(
      "#table-picker .cell",
    );
    rendered[5 + 3].click();
    expect(picker.submit).toHaveBeenCalledWith(4, 2);
  });

  it("resizes only while open", () => {
    resizePicker(1, 1);
    expect(tablePicker.value).toBeNull();

    open();
    resizePicker(1, -1);
    expect(tablePicker.value).toMatchObject({ cols: 4, rows: 2 });
  });

  it("labels a size", () => {
    expect(sizeLabel(2, 5)).toBe("2 × 5");
  });
});
