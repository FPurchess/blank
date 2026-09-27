import { describe, expect, it } from "vitest";

import {
  formatLength,
  paperUnit,
  parseLength,
  sameLength,
  toUnit,
} from "./units";

describe("parseLength", () => {
  it.each([
    ["1in", 72],
    ["72pt", 72],
    ["2.54cm", 72],
    ["25.4mm", 72],
    [" 2,54 CM ", 72],
    ["3.mm", 8.50394],
    [".5in", 36],
  ] as const)("reads %j", (value, points) => {
    expect(parseLength(value)).toBeCloseTo(points, 5);
  });

  it.each(["", "2", "2 inches", "-1cm", "1e2mm", "cm", 2, null, undefined])(
    "refuses %j",
    (value) => {
      expect(parseLength(value)).toBeUndefined();
    },
  );
});

describe("formatLength", () => {
  it.each([
    [parseLength("2.5cm") as number, "cm", "2.5cm"],
    [parseLength("1.27cm") as number, "cm", "1.27cm"],
    [72, "in", "1in"],
    [parseLength("210mm") as number, "mm", "210mm"],
    [10.25, "pt", "10.3pt"],
  ] as const)("writes %d points in %s", (points, unit, written) => {
    expect(formatLength(points, unit)).toBe(written);
    expect(toUnit(points, unit)).toBe(parseFloat(written));
  });
});

describe("paperUnit", () => {
  it("measures paper in millimetres or inches", () => {
    expect(paperUnit("cm")).toBe("mm");
    expect(paperUnit("mm")).toBe("mm");
    expect(paperUnit("in")).toBe("in");
  });
});

describe("sameLength", () => {
  it("allows for the rounding of Word's twentieths of a point", () => {
    expect(sameLength(70.866, 70.85)).toBe(true);
    expect(sameLength(70.866, 72)).toBe(false);
  });
});
