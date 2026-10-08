import { describe, expect, it } from "vitest";

import { appliesOnEnter, chooseAt, firstStop, isOn } from "./optionGroupModel";

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

describe("appliesOnEnter", () => {
  it("applies on an option, not on another button or what isn't one", () => {
    const row = document.createElement("div");
    row.className = "options";
    const option = document.createElement("button");
    row.append(option);
    const list = document.createElement("button");
    list.setAttribute("aria-haspopup", "menu");
    expect(appliesOnEnter(option)).toBe(true);
    expect(appliesOnEnter(list)).toBe(false);
    expect(appliesOnEnter(document.createElement("button"))).toBe(false);
    expect(appliesOnEnter(document.createElement("input"))).toBe(false);
    expect(appliesOnEnter(null)).toBe(false);
  });
});
