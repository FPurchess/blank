import { describe, expect, it } from "vitest";

import { checkAddress } from "./fieldCheck";

const messages = { empty: "Enter one", unsavable: "Not that" };

describe("checkAddress", () => {
  it("asks for an address only while submitting", () => {
    expect(checkAddress(" ", false, messages)).toEqual({
      hint: "",
      valid: false,
      blocked: false,
    });
    expect(checkAddress("", true, messages)).toEqual({
      hint: "Enter one",
      valid: false,
      blocked: false,
    });
  });

  it("blocks an address that can't be saved", () => {
    expect(checkAddress("javascript:alert(1)", false, messages)).toEqual({
      hint: "Not that",
      valid: false,
      blocked: true,
    });
  });

  it("hands on the normalized address to check further", () => {
    expect(checkAddress("  https://blank.app ", false, messages)).toEqual({
      value: "https://blank.app",
    });
  });
});
