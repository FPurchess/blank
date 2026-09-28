import { describe, expect, it } from "vitest";

import { chooseAt, firstStop, isOn, stepTo } from "./optionGroupModel";

const OPTIONS = ["a", "b", "c"].map((value) => ({ value, label: value }));

describe("isOn", () => {
  it("is the checked option of a radio group, or an option that is on", () => {
    expect(isOn("b", "b")).toBe(true);
    expect(isOn("b", "a")).toBe(false);
    expect(isOn(["a", "c"], "c")).toBe(true);
    expect(isOn(["a", "c"], "b")).toBe(false);
  });
});

describe("chooseAt", () => {
  it("checks the pressed option of a radio group", () => {
    expect(chooseAt("a", OPTIONS, 2)).toBe("c");
  });

  it("switches a toggle, keeping the order of the options", () => {
    expect(chooseAt(["c"], OPTIONS, 0)).toEqual(["a", "c"]);
    expect(chooseAt(["a", "c"], OPTIONS, 0)).toEqual(["c"]);
  });
});

describe("firstStop", () => {
  it("starts on the checked option, or the first", () => {
    expect(firstStop("b", OPTIONS)).toBe(1);
    expect(firstStop("x", OPTIONS)).toBe(0);
    expect(firstStop(["c"], OPTIONS)).toBe(0);
  });
});

describe("stepTo", () => {
  it("moves with ←→, wrapping around, and to the ends with Home and End", () => {
    expect(stepTo("ArrowRight", 0, 3)).toBe(1);
    expect(stepTo("ArrowRight", 2, 3)).toBe(0);
    expect(stepTo("ArrowLeft", 0, 3)).toBe(2);
    expect(stepTo("Home", 2, 3)).toBe(0);
    expect(stepTo("End", 0, 3)).toBe(2);
    expect(stepTo("ArrowDown", 0, 3)).toBeUndefined();
  });
});
