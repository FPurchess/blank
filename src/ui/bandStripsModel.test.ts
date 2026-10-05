import { describe, expect, it } from "vitest";

import { TOP_BAR_HEIGHT } from "../chrome";
import { NEAR_BOTTOM, NEAR_TOP, nearEdge } from "./bandStripsModel";

describe("nearEdge", () => {
  it("shows the top hint just below the top area, never on it", () => {
    expect(nearEdge(0, 600, false)).toBeNull();
    expect(nearEdge(TOP_BAR_HEIGHT - 1, 600, false)).toBeNull();
    expect(nearEdge(TOP_BAR_HEIGHT, 600, false)).toBe("top");
    expect(nearEdge(NEAR_TOP - 1, 600, false)).toBe("top");
    expect(nearEdge(NEAR_TOP, 600, false)).toBeNull();
  });

  it("shows the bottom hint on the status bar and just above it", () => {
    expect(nearEdge(600 - NEAR_BOTTOM, 600, false)).toBeNull();
    expect(nearEdge(600 - NEAR_BOTTOM + 1, 600, false)).toBe("bottom");
    expect(nearEdge(599, 600, false)).toBe("bottom");
  });

  it("leaves the bottom hint away on the status bar's controls", () => {
    expect(nearEdge(590, 600, true)).toBeNull();
  });
});
