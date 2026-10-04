import { describe, expect, it } from "vitest";

import { BAND_HEIGHT, STATUS_HEIGHT, TOP_BAR_HEIGHT } from "./chrome";
import { scssNumber } from "./scss/contrast";

describe("the heights of the bars", () => {
  it("are those the styles set", () => {
    expect(TOP_BAR_HEIGHT).toBe(scssNumber("main.scss", "top-bar-height"));
    expect(STATUS_HEIGHT).toBe(scssNumber("_statusbar.scss", "status-height"));
    expect(BAND_HEIGHT).toBe(scssNumber("main.scss", "band-height"));
  });
});
