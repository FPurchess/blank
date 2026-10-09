import { describe, expect, it } from "vitest";

import { compileMain } from "./compiled";

// `overflow: clip`, which WebKit's WebDriver reads as text where it reads
// hidden overflow as empty, came only with Safari 16. Blank runs on macOS 12,
// whose Safari 15 drops it and would let the text spill, so every clip
// comes after a `hidden` it falls back on.

describe("overflow: clip", () => {
  it("always falls back on hidden for Safari 15", async () => {
    const css = await compileMain();
    const rules = [...css.matchAll(/([^{}]+)\{([^{}]*)\}/g)];
    const clipped = rules.filter(([, , body]) =>
      /overflow(-[xy])?:clip/.test(body),
    );
    expect(clipped.length).toBeGreaterThan(0);
    const bare = clipped
      .filter(([, , body]) =>
        [...body.matchAll(/(overflow(?:-[xy])?):clip/g)].some(
          ({ 1: property, index }) =>
            !body.slice(0, index).includes(`${property}:hidden`),
        ),
      )
      .map(([, selectors]) => selectors.trim());
    expect(bare).toEqual([]);
  });
});
