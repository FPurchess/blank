import { describe, expect, it } from "vitest";

import { formatSigningDate, isDateFormat } from "./date";

describe("the date next to a signature", () => {
  const day = new Date(2026, 9, 8);

  it("is written in the document's language", () => {
    expect(formatSigningDate(day, "en-GB", "long")).toBe("8 October 2026");
    expect(formatSigningDate(day, "de", "long")).toBe("8. Oktober 2026");
    expect(formatSigningDate(day, "de", "short")).toBe("08.10.2026");
    expect(formatSigningDate(day, "en-US", "short")).toBe("10/08/2026");
  });

  it("is the same everywhere as ISO 8601", () => {
    expect(formatSigningDate(day, "de", "iso")).toBe("2026-10-08");
  });

  it("falls back to English for a language the webview doesn't know", () => {
    expect(formatSigningDate(day, "not a tag!", "long")).toBe(
      "October 8, 2026",
    );
  });

  it("knows its formats", () => {
    expect(isDateFormat("short")).toBe(true);
    expect(isDateFormat("medium")).toBe(false);
  });
});
