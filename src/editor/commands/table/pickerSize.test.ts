import { afterEach, describe, expect, it, vi } from "vitest";

import { tablePicker, type TablePickerState } from "../../../state";
import {
  choosePickerSize,
  DEFAULT_SIZE,
  resizePicker,
  sizeLabel,
} from "./pickerSize";

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

describe("pickerSize", () => {
  afterEach(() => {
    tablePicker.value = null;
  });

  it("opens with three columns, a header row and two rows", () => {
    expect(DEFAULT_SIZE).toEqual({ cols: 3, rows: 3 });
  });

  it("resizes only while open, between 1 and 20", () => {
    resizePicker(1, 1);
    expect(tablePicker.value).toBeNull();

    open();
    resizePicker(1, -1);
    expect(tablePicker.value).toMatchObject({ cols: 4, rows: 2 });
    resizePicker(-10, 30);
    expect(tablePicker.value).toMatchObject({ cols: 1, rows: 20 });
  });

  it("chooses a size, clamped between 1 and 20", () => {
    open();
    choosePickerSize(0, 25);

    expect(tablePicker.value).toMatchObject({ cols: 1, rows: 20 });
  });

  it("keeps the picker as it is when the size doesn't change", () => {
    const picker = open(4, 2);
    choosePickerSize(4, 2);
    choosePickerSize(4, 2);

    expect(tablePicker.value).toBe(picker);
  });

  it("chooses nothing while closed", () => {
    choosePickerSize(4, 2);

    expect(tablePicker.value).toBeNull();
  });

  it("labels a size", () => {
    expect(sizeLabel(2, 5)).toBe("2 × 5");
  });
});
