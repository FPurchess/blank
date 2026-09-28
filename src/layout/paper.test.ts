import { afterEach, describe, expect, it, vi } from "vitest";

import {
  localePaper,
  localeUnit,
  matchPaper,
  regionOf,
  systemLocale,
} from "./paper";

describe("systemLocale", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const withLanguage = (language: string) =>
    vi.stubGlobal("navigator", { ...navigator, language });

  it("takes the webview's language, in its canonical form", () => {
    withLanguage("de-de");
    expect(systemLocale()).toBe("de-DE");
  });

  it("asks Intl for a language Intl refuses, like C on Linux", () => {
    const own = Intl.DateTimeFormat().resolvedOptions().locale;
    for (const language of ["C", "C.UTF-8", ""]) {
      withLanguage(language);
      expect(systemLocale()).toBe(own);
    }
    // which the date formats take
    expect(() => new Intl.DateTimeFormat(systemLocale())).not.toThrow();
  });
});

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
