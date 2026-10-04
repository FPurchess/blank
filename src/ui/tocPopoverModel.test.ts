import { afterEach, describe, expect, it } from "vitest";

import {
  anchorOf,
  DEPTH_OPTIONS,
  SETTINGS_BUTTON,
  titleOf,
} from "./tocPopoverModel";

describe("the settings of a table of contents", () => {
  afterEach(() => document.body.replaceChildren());

  it("lists the headings 1 only, up to 2, … up to 6", () => {
    expect(DEPTH_OPTIONS.map(({ label }) => label)).toEqual([
      "Heading 1",
      "1 – 2",
      "1 – 3",
      "1 – 4",
      "1 – 5",
      "1 – 6",
    ]);
  });

  it("gives an empty title back the default one", () => {
    expect(titleOf("  Overview ")).toBe("Overview");
    expect(titleOf("  ")).toBe("Contents");
  });

  it("opens below the toolbar's settings button, or else the block", () => {
    const block = { left: 0, top: 50, bottom: 90, right: 300 };
    expect(anchorOf(block)).toBe(block);
    document.body.innerHTML =
      '<div id="block-toolbar"><button data-id="block-edit"></button></div>';
    expect(document.querySelector(SETTINGS_BUTTON)).not.toBeNull();
    expect(anchorOf(block)).not.toBe(block);
  });
});
