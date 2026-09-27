import { describe, expect, it } from "vitest";

import { separated } from "./separated";

describe("separated", () => {
  it("puts the separator between neighbours of different groups", () => {
    const items = [
      { id: 1, group: "a" },
      { id: 2, group: "a" },
      { id: 3, group: "b" },
      { id: 4, group: "a" },
    ];

    expect(
      separated(items, "-" as const).map((i) => (i === "-" ? i : i.id)),
    ).toEqual([1, 2, "-", 3, "-", 4]);
    expect(separated([], "-")).toEqual([]);
  });
});
