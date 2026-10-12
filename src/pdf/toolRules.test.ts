import { describe, expect, it } from "vitest";

import type { PdfRules } from "../signing/ipc";
import {
  CHECKING,
  DAMAGED,
  NEEDS_LAYOUT,
  NO_CHANGES,
  NO_PLACE,
  NOT_OPEN,
  RESTRICTED,
  signRefusal,
  type ToolContext,
  toolbarNote,
  toolRefusal,
} from "./toolRules";

const rules = (over: Partial<PdfRules> = {}): PdfRules => ({
  signed: false,
  docmdp: null,
  encrypted: false,
  damaged: false,
  locked: [],
  ...over,
});

const context = (over: Partial<ToolContext> = {}): ToolContext => ({
  opened: {
    sha256: "abc",
    pages: [{ width: 595, height: 842, rotation: 0 }],
    repaired: false,
    encrypted: false,
  },
  rules: rules(),
  engine: true,
  place: "Berlin",
  ...over,
});

describe("what the signing tools may place", () => {
  it("place everything on a PDF nobody signed", () => {
    for (const kind of ["signature", "initials", "date", "place"] as const)
      expect(toolRefusal(kind, context())).toBeNull();
    expect(signRefusal(context())).toBeNull();
    expect(toolbarNote(context())).toBeNull();
  });

  it("keep to the signature on a signed or certified PDF, saying why", () => {
    for (const signed of [
      context({ rules: rules({ signed: true }) }),
      context({ rules: rules({ docmdp: 2 }) }),
    ]) {
      expect(toolRefusal("signature", signed)).toBeNull();
      expect(toolRefusal("initials", signed)).toBe(
        "Initials would change pages the earlier signers signed.",
      );
      expect(toolRefusal("date", signed)).toBe(
        "A date would change pages the earlier signers signed.",
      );
      expect(toolRefusal("place", signed)).toBe(
        "A place would change pages the earlier signers signed.",
      );
      expect(signRefusal(signed)).toBeNull();
    }
  });

  it("place nothing on a PDF that allows no changes, nor sign it", () => {
    const p1 = context({ rules: rules({ docmdp: 1, signed: true }) });
    expect(toolRefusal("signature", p1)).toBe(NO_CHANGES);
    expect(signRefusal(p1)).toBe(NO_CHANGES);
    expect(toolbarNote(p1)).toBe(NO_CHANGES);
  });

  it("place nothing on an encrypted or damaged PDF", () => {
    const encrypted = context({ rules: rules({ encrypted: true }) });
    expect(toolRefusal("date", encrypted)).toBe(RESTRICTED);
    expect(signRefusal(encrypted)).toBe(RESTRICTED);
    const repaired = context({
      opened: { ...context().opened!, repaired: true },
    });
    expect(toolRefusal("signature", repaired)).toBe(DAMAGED);
    expect(toolbarNote(repaired)).toBe(DAMAGED);
  });

  it("wait for the PDF to open and its rules to be read", () => {
    expect(toolRefusal("signature", context({ opened: null }))).toBe(NOT_OPEN);
    expect(toolbarNote(context({ opened: null }))).toBeNull();
    expect(toolRefusal("signature", context({ rules: null }))).toBe(CHECKING);
    expect(signRefusal(context({ rules: null }))).toBe(CHECKING);
  });

  it("need the layout, and a place for the place", () => {
    const without = context({ engine: false });
    expect(toolRefusal("signature", without)).toBe(NEEDS_LAYOUT);
    expect(toolbarNote(without)).toBe(NEEDS_LAYOUT);
    // signing itself needs no stamps
    expect(signRefusal(without)).toBeNull();
    expect(toolRefusal("place", context({ place: " " }))).toBe(NO_PLACE);
  });
});
