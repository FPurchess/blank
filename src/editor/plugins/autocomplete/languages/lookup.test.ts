import { describe, expect, it } from "vitest";

import { languageRules, supportedLanguages } from ".";
import { isoCodes } from "./iso639-1";
import { getRules, hasOwnRules, isIsoCode } from "./lookup";

describe("languages", () => {
  it.each(supportedLanguages)("ships complete rules for %s", (code) => {
    const rules = languageRules[code];

    expect(isoCodes.has(code)).toBe(true);
    expect(rules.quotes.double).toHaveLength(2);
    expect(rules.quotes.single).toHaveLength(2);
    expect(["–", "—"]).toContain(rules.spacedDash);
    expect(["–", "—"]).toContain(rules.wordDash);
    expect(rules.twoCapitalsExceptions).toContain("MHz");
  });

  it("returns the rules of a supported language", () => {
    expect(getRules("de")).toBe(languageRules.de);
    expect(hasOwnRules("de")).toBe(true);
  });

  it.each(["nb", "nn"])("uses the Norwegian rules for %s", (code) => {
    expect(getRules(code)).toBe(languageRules.no);
    expect(hasOwnRules(code)).toBe(true);
  });

  it("falls back to English for other languages", () => {
    expect(getRules("tr")).toBe(languageRules.en);
    expect(hasOwnRules("tr")).toBe(false);
  });

  it.each([
    ["de", true],
    ["zu", true],
    ["xx", false],
    ["DE", false],
    ["deu", false],
    [null, false],
    [1, false],
  ])("checks whether %j is an ISO 639-1 code", (value, expected) => {
    expect(isIsoCode(value)).toBe(expected);
  });
});
