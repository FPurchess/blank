import { describe, expect, it } from "vitest";

import { scrollFor, wheelPixels } from "./scrollModel";

describe("scrollFor", () => {
  it("scrolls only as far as needed", () => {
    expect(scrollFor({ top: 300, height: 20 }, 0, 600)).toBeNull();
    expect(scrollFor({ top: 900, height: 20 }, 0, 600)).toBe(
      900 + 20 + 64 - 600,
    );
    // less room above, where the top area no longer covers the view
    expect(scrollFor({ top: 100, height: 20 }, 500, 600)).toBe(80);
  });
});

describe("wheelPixels", () => {
  it("turns lines and pages into pixels", () => {
    expect(wheelPixels({ deltaY: 30, deltaMode: 0 }, 600)).toBe(30);
    expect(wheelPixels({ deltaY: 3, deltaMode: 1 }, 600)).toBe(48);
    expect(wheelPixels({ deltaY: 1, deltaMode: 2 }, 600)).toBe(600);
  });
});
