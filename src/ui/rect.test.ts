import { describe, expect, it } from "vitest";

import { styleOf } from "./rect";

describe("styleOf", () => {
  it("puts an element at a box, as high as its content without a height", () => {
    expect(styleOf({ left: 1, top: 2, width: 3, height: 4 })).toEqual({
      left: "1px",
      top: "2px",
      width: "3px",
      height: "4px",
    });
    expect(styleOf({ left: 1, top: 2, width: 3 })).toEqual({
      left: "1px",
      top: "2px",
      width: "3px",
    });
    expect(styleOf(null)).toBeUndefined();
  });
});
