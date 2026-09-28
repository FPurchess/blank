import { describe, expect, it } from "vitest";

import { shownIn } from "./dom";

describe("shownIn", () => {
  it("finds what matches, in order, leaving out what is hidden", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <button id="a"></button>
      <div hidden><button id="gone"></button></div>
      <button id="hidden" hidden></button>
      <span><button id="b"></button></span>`;

    expect(shownIn(root, "button").map((element) => element.id)).toEqual([
      "a",
      "b",
    ]);
  });
});
