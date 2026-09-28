import { describe, expect, it, vi } from "vitest";

import type { TablePickerState } from "../state";
import { pickerCells, shownSize } from "./tablePickerModel";

const picker = (cols: number, rows: number): TablePickerState => ({
  cols,
  rows,
  anchor: { left: 0, top: 0, bottom: 0 },
  submit: vi.fn(),
  cancel: vi.fn(),
});

describe("shownSize", () => {
  it.each([
    [3, 3, { cols: 10, rows: 8 }],
    [12, 8, { cols: 13, rows: 9 }],
    [20, 20, { cols: 20, rows: 20 }],
  ])("shows %i × %i in a grid of %o", (cols, rows, shown) => {
    expect(shownSize(picker(cols, rows))).toEqual(shown);
  });
});

describe("pickerCells", () => {
  it("lists the cells row by row, keyed by their place", () => {
    expect(pickerCells(2, 2)).toEqual([
      { key: "1-1", col: 1, row: 1 },
      { key: "2-1", col: 2, row: 1 },
      { key: "1-2", col: 1, row: 2 },
      { key: "2-2", col: 2, row: 2 },
    ]);
  });
});
