import { describe, expect, it } from "vitest";

import { scssNumber } from "./contrast";

// the status bar's items give way as the window narrows (_statusbar.scss)
describe("the status bar on a narrow window", () => {
  const wide = scssNumber("_statusbar.scss", "status-wide");
  const narrow = scssNumber("_statusbar.scss", "status-narrow");

  it("drops the misspelling buttons first, then the zoom's − and +", () => {
    expect(narrow).toBeLessThan(wide);
  });

  // the window Blank opens at, and a narrow one, where the order matters
  const DEFAULT_WIDTH = 800;
  const NARROW_WIDTH = 640;

  it("keeps the zoom's − and + at the default width, and drops both narrow", () => {
    expect(DEFAULT_WIDTH).toBeLessThanOrEqual(wide);
    expect(DEFAULT_WIDTH).toBeGreaterThan(narrow);
    expect(NARROW_WIDTH).toBeLessThanOrEqual(narrow);
  });
});
