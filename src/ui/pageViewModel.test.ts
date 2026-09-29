import { describe, expect, it } from "vitest";

import { endMark, scrollFor } from "./pageViewModel";

describe("scrollFor", () => {
  it("scrolls only as far as needed", () => {
    expect(scrollFor({ top: 300, height: 20 }, 0, 600)).toBeNull();
    expect(scrollFor({ top: 900, height: 20 }, 0, 600)).toBe(
      900 + 20 + 64 - 600,
    );
    expect(scrollFor({ top: 100, height: 20 }, 500, 600)).toBe(36);
  });
});

describe("endMark", () => {
  it("shows the footer, the number without one, and the next header", () => {
    const bands = ["T", "", "", "", "2 of 5", ""];
    expect(endMark(1, bands, ["Next", "", "", "", "", ""])).toEqual({
      footer: ["", "2 of 5", ""],
      number: "",
      header: ["Next", "", ""],
    });
    expect(endMark(1, ["", "", "", "", "", ""], null)).toMatchObject({
      number: "2",
      header: ["", "", ""],
    });
  });
});
