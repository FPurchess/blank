import { describe, expect, it } from "vitest";

import { FALLBACK_FONT, isCovered, withFallback } from "./fallback";

describe("exporters.pdf fallback", () => {
  describe("isCovered", () => {
    it("covers Latin, German and typographic characters", () => {
      for (const char of "aZ09 äöüßẞ—–…“”„→←") {
        expect(isCovered(char.codePointAt(0)!)).toBe(true);
      }
    });

    it("does not cover the double arrows or other scripts", () => {
      for (const char of "⇐⇒⇔שل") {
        expect(isCovered(char.codePointAt(0)!)).toBe(false);
      }
    });
  });

  describe("withFallback", () => {
    it("keeps covered text as a plain string", () => {
      expect(withFallback("plain text")).toBe("plain text");
      expect(withFallback("")).toBe("");
    });

    it("splits uncovered characters into fallback runs", () => {
      expect(withFallback("a ⇒⇔ b")).toEqual([
        { text: "a " },
        { text: "⇒⇔", font: FALLBACK_FONT },
        { text: " b" },
      ]);
    });

    it("copies marks onto every run", () => {
      expect(withFallback("a ⇒", { italics: true })).toEqual([
        { text: "a ", italics: true },
        { text: "⇒", italics: true, font: FALLBACK_FONT },
      ]);
    });

    it("wraps text that is uncovered as a whole", () => {
      expect(withFallback("⇒")).toEqual([{ text: "⇒", font: FALLBACK_FONT }]);
    });

    it("keeps characters outside the basic plane together", () => {
      expect(withFallback("😀")).toEqual([{ text: "😀", font: FALLBACK_FONT }]);
    });
  });
});
