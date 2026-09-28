import { describe, expect, it } from "vitest";

import { MARGIN_FIELDS, stopAfter, stopsIn } from "./pageSetupModel";

describe("MARGIN_FIELDS", () => {
  it("has a field per side, labelled by it", () => {
    expect(MARGIN_FIELDS.map((field) => field.label)).toEqual([
      "Top",
      "Right",
      "Bottom",
      "Left",
    ]);
  });
});

describe("stopsIn", () => {
  it("finds the option in the tab order of each row and the visible fields", () => {
    const element = document.createElement("div");
    element.innerHTML = `
      <div data-row="a"><button tabindex="-1"></button><button id="a" tabindex="0"></button></div>
      <div class="custom" hidden><input id="gone"></div>
      <div class="custom"><input id="field"></div>
      <div data-row="b"><button id="b" tabindex="0"></button></div>`;

    expect(stopsIn(element).map((stop) => stop.id)).toEqual([
      "a",
      "field",
      "b",
    ]);
  });
});

describe("stopAfter", () => {
  const [a, b] = [document.createElement("i"), document.createElement("b")];

  it("goes to the stop above or below, and nowhere past the ends", () => {
    expect(stopAfter([a, b], a, 1)).toBe(b);
    expect(stopAfter([a, b], b, -1)).toBe(a);
    expect(stopAfter([a, b], b, 1)).toBeUndefined();
    expect(stopAfter([a, b], a, -1)).toBeUndefined();
  });

  it("starts at the first stop from anywhere else", () => {
    expect(stopAfter([a, b], null, 1)).toBe(a);
  });
});
