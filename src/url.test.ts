import { describe, expect, it } from "vitest";

import { isAbsoluteUrl, isSavableUrl, normalizeUrl } from "./url";

describe("url", () => {
  describe("normalizeUrl", () => {
    it.each([
      ["  https://example.com \n", "https://example.com"],
      ["https://example.com/a b", "https://example.com/a%20b"],
      ["https://example.com/a\tb", "https://example.com/a%09b"],
      ["https://example.com/<a>", "https://example.com/%3Ca%3E"],
      ["https://example.com/a%20b", "https://example.com/a%20b"],
      ["", ""],
    ])("normalizes %j to %j", (url, expected) => {
      expect(normalizeUrl(url)).toBe(expected);
    });
  });

  describe("isSavableUrl", () => {
    it.each([
      "https://example.com",
      "mailto:someone@example.com",
      "./notes.md",
      "#heading",
      "data:image/png;base64,AAAA",
    ])("accepts %j", (url) => {
      expect(isSavableUrl(url)).toBe(true);
    });

    it.each([
      "javascript:alert(1)",
      "JavaScript:alert(1)",
      "vbscript:msgbox",
      "file:///tmp/notes.md",
      "data:text/html,<b>x</b>",
    ])("rejects %j", (url) => {
      expect(isSavableUrl(url)).toBe(false);
    });
  });

  describe("isAbsoluteUrl", () => {
    it.each(["https://example.com", "mailto:someone@example.com"])(
      "accepts %j",
      (url) => {
        expect(isAbsoluteUrl(url)).toBe(true);
      },
    );

    it.each(["", "example", "./notes.md", "#heading", "https://a b.com"])(
      "rejects %j",
      (url) => {
        expect(isAbsoluteUrl(url)).toBe(false);
      },
    );
  });
});
