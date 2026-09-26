import { describe, expect, it, vi } from "vitest";

import { languageRules, supportedLanguages } from ".";
import { isoCodes } from "./iso639-1";
import {
  baseLanguage,
  canonicalTag,
  detectLanguage,
  getRules,
  hasOwnRules,
  isIsoCode,
  isLanguageTag,
} from "./lookup";

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

  it("uses the rules of the base language for a regional tag", () => {
    expect(baseLanguage("de-CH")).toBe("de");
    expect(getRules("de-CH")).toBe(languageRules.de);
    expect(hasOwnRules("pt-PT")).toBe(true);
    expect(hasOwnRules("tr")).toBe(false);
  });

  it.each([
    ["de", true],
    ["tr", true],
    ["de-CH", true],
    ["sr-Latn", true],
    ["de-ch", false],
    ["de-XX", false],
    ["xx", false],
    [undefined, false],
  ])("checks whether %j is a language tag", (value, expected) => {
    expect(isLanguageTag(value)).toBe(expected);
  });

  it("finds the tag of a dictionary regardless of case", () => {
    expect(canonicalTag("DE-ch")).toBe("de-CH");
    expect(canonicalTag("en-US")).toBeUndefined();
  });

  it.each([
    ["de-AT", "de-AT"],
    ["de_CH", "de-CH"],
    ["de-DE", "de"],
    ["en-US", "en"],
    ["fi", "fi"],
    ["xx-YY", "en"],
  ])("detects the system language %j as %j", (system, expected) => {
    vi.spyOn(navigator, "language", "get").mockReturnValue(system);

    expect(detectLanguage()).toBe(expected);
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
