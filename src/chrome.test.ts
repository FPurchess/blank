import { describe, expect, it } from "vitest";

import {
  BAND_HEIGHT,
  STATUS_HEIGHT,
  TAB_ROW_HEIGHT,
  TOOLBAR_HEIGHT,
  TOP_BAR_HEIGHT,
} from "./chrome";
import { scssNumber, scssValue } from "./scss/contrast";

describe("the heights of the bars", () => {
  it("are those the styles set", () => {
    expect(TAB_ROW_HEIGHT).toBe(scssNumber("_toparea.scss", "tab-row-height"));
    expect(TOOLBAR_HEIGHT).toBe(scssNumber("_toparea.scss", "toolbar-height"));
    expect(STATUS_HEIGHT).toBe(scssNumber("_statusbar.scss", "status-height"));
    expect(BAND_HEIGHT).toBe(scssNumber("main.scss", "band-height"));
  });

  it("make the top area of its two rows", () => {
    expect(TOP_BAR_HEIGHT).toBe(TAB_ROW_HEIGHT + TOOLBAR_HEIGHT);
    expect(scssValue("_toparea.scss", "top-bar-height")).toBe(
      "$tab-row-height + $toolbar-height",
    );
  });
});
