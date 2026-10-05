import { describe, expect, it } from "vitest";

import { stepTo } from "./rovingModel";

describe("stepTo", () => {
  it("moves with ←→, wrapping around, and to the ends with Home and End", () => {
    expect(stepTo("ArrowRight", 0, 3)).toBe(1);
    expect(stepTo("ArrowRight", 2, 3)).toBe(0);
    expect(stepTo("ArrowLeft", 0, 3)).toBe(2);
    expect(stepTo("Home", 2, 3)).toBe(0);
    expect(stepTo("End", 0, 3)).toBe(2);
    expect(stepTo("ArrowDown", 0, 3)).toBeUndefined();
  });

  it("moves down a column with ↓ ↑ only", () => {
    expect(stepTo("ArrowDown", 2, 3, "vertical")).toBe(0);
    expect(stepTo("ArrowUp", 0, 3, "vertical")).toBe(2);
    expect(stepTo("End", 0, 3, "vertical")).toBe(2);
    expect(stepTo("ArrowRight", 0, 3, "vertical")).toBeUndefined();
  });

  it("moves through a grid with every arrow", () => {
    expect(stepTo("ArrowRight", 0, 3, "both")).toBe(1);
    expect(stepTo("ArrowDown", 0, 3, "both")).toBe(1);
    expect(stepTo("ArrowUp", 0, 3, "both")).toBe(2);
  });
});
