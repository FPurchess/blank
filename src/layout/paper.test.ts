import { describe, expect, it } from "vitest";

import { localePaper, localeUnit, matchPaper, regionOf } from "./paper";

describe("regionOf", () => {
  it.each([
    ["de-DE", "DE"],
    ["en-US", "US"],
    ["en", "US"],
    ["de", "DE"],
    ["pt-BR", "BR"],
  ])("finds the region of %s", (locale, region) => {
    expect(regionOf(locale)).toBe(region);
  });

  it("returns nothing for a broken locale", () => {
    expect(regionOf("not a locale")).toBeUndefined();
  });
});

describe("localePaper and localeUnit", () => {
  it.each([
    ["en-US", "letter", "in"],
    ["es-MX", "letter", "in"],
    ["fr-CA", "letter", "in"],
    ["en-GB", "a4", "cm"],
    ["de-CH", "a4", "cm"],
    ["ja-JP", "a4", "cm"],
    ["not a locale", "a4", "cm"],
  ])("gives %s %s paper in %s", (locale, paper, unit) => {
    expect(localePaper(locale)).toBe(paper);
    expect(localeUnit(locale)).toBe(unit);
  });

  it("follows the system locale by default", () => {
    // jsdom's
    expect(navigator.language).toBe("en-US");
    expect(localePaper()).toBe("letter");
    expect(localeUnit()).toBe("in");
  });
});

describe("matchPaper", () => {
  it("finds paper in either orientation, as Word rounds it", () => {
    // Word writes A4 as 11906 × 16838 twentieths of a point
    expect(matchPaper(11906 / 20, 16838 / 20)).toBe("a4");
    expect(matchPaper(792, 612)).toBe("letter");
    expect(matchPaper(612, 1008)).toBe("legal");
  });

  it("returns nothing for other sizes", () => {
    expect(matchPaper(500, 700)).toBeUndefined();
  });
});
