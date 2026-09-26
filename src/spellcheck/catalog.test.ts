import { describe, expect, it } from "vitest";

import {
  dictionaryTag,
  dictionaryTags,
  hasDictionary,
  isBundled,
} from "./catalog";

describe("catalog", () => {
  it("uses the Bokmål dictionary for Norwegian", () => {
    expect(dictionaryTag("no")).toBe("nb");
    expect(dictionaryTag("de")).toBe("de");
    expect(hasDictionary("no")).toBe(true);
  });

  it("knows which languages have a usable dictionary", () => {
    expect(hasDictionary("de-CH")).toBe(true);
    // no Hunspell dictionary exists for Finnish
    expect(hasDictionary("fi")).toBe(false);
    // listed, but the engine can't load it
    expect(hasDictionary("tr")).toBe(false);
    expect(dictionaryTags).toContain("en-GB");
    expect(dictionaryTags).not.toContain("tr");
  });

  it("builds in English, German, French and Spanish", () => {
    expect(["de", "en", "es", "fr"].every(isBundled)).toBe(true);
    expect(isBundled("de-CH")).toBe(false);
    expect(isBundled("xx")).toBe(false);
  });
});
