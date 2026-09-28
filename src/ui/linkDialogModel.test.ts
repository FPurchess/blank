import { describe, expect, it } from "vitest";

import { checkLink } from "./linkDialogModel";

describe("checkLink", () => {
  it("accepts a full URL without a hint", () => {
    expect(checkLink("https://blank.app")).toEqual({
      hint: "",
      valid: true,
      blocked: false,
    });
  });

  it("warns about an incomplete URL, which can still be saved", () => {
    expect(checkLink("./notes.md")).toMatchObject({
      hint: "This doesn't look like a full URL, e.g. https://example.com",
      valid: true,
      blocked: false,
    });
  });

  it("blocks URLs that can't be saved", () => {
    expect(checkLink("javascript:alert(1)")).toMatchObject({
      hint: "javascript:, vbscript:, file: and data: links can't be saved",
      valid: false,
      blocked: true,
    });
  });

  it("asks for a URL only once the user tries to save without one", () => {
    expect(checkLink("  ")).toEqual({ hint: "", valid: false, blocked: false });
    expect(checkLink("", true)).toEqual({
      hint: "Enter a URL",
      valid: false,
      blocked: false,
    });
  });
});
