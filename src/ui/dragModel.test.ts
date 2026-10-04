import { describe, expect, it } from "vitest";

import { dropAt, movedBy } from "./dragModel";

describe("dropping rows and columns", () => {
  it("drops at the nearest line outside the dragged rows, after the header", () => {
    const lines = [100, 140, 180, 220, 260];
    expect(dropAt(lines, [3, 4], 150, 1)).toBe(1);
    expect(dropAt(lines, [3, 4], 90, 1)).toBe(1);
    expect(dropAt(lines, [1, 3], 170, 1)).toBe(1);
    expect(dropAt(lines, [1, 2], 250, 1)).toBe(4);
  });

  it("tells how far the drop moves them", () => {
    expect(movedBy([3, 4], 1)).toBe(-2);
    expect(movedBy([1, 2], 4)).toBe(2);
    expect(movedBy([1, 3], 3)).toBe(0);
  });
});
