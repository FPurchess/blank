import { describe, expect, it } from "vitest";

import { iconNames, iconPath } from "./icons";

describe("icons", () => {
  it("draws every icon", () => {
    for (const name of iconNames) expect(iconPath(name)).not.toBe("");
  });

  it("draws nothing for an unknown icon", () => {
    expect(iconPath("unknown")).toBe("");
  });
});
