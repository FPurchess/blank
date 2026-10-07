import { describe, expect, it } from "vitest";

import { scssNumber } from "./contrast";

// the status bar's items give way as the window narrows (_statusbar.scss)
describe("the status bar on a narrow window", () => {
  const wide = scssNumber("_statusbar.scss", "status-wide");
  const narrow = scssNumber("_statusbar.scss", "status-narrow");

  it("drops the misspelling buttons first, then the zoom's − and +", () => {
    expect(narrow).toBeLessThan(wide);
  });

  it("keeps the zoom's − and + at 800 px, and drops both at 640 px", () => {
    expect(800).toBeLessThanOrEqual(wide);
    expect(800).toBeGreaterThan(narrow);
    expect(640).toBeLessThanOrEqual(narrow);
  });
});
