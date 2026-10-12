import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import type { PdfRules } from "../signing/ipc";
import {
  CHECKING,
  DAMAGED,
  NO_CHANGES,
  NOT_OPEN,
  RESTRICTED,
  signRefusal,
  type ToolContext,
  toolbarNote,
  toolRefusal,
} from "./toolRules";
import { STAMPS_NEED_LAYOUT } from "./stamps";

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
  signing: false,
  signatures: 0,
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

  it("need the layout", () => {
    const without = context({ engine: false });
    expect(toolRefusal("signature", without)).toBe(STAMPS_NEED_LAYOUT);
    expect(toolbarNote(without)).toBe(STAMPS_NEED_LAYOUT);
    // signing itself needs no stamps
    expect(signRefusal(without)).toBeNull();
    // a place Blank doesn't know yet is asked for when it's placed
    expect(toolRefusal("place", context())).toBeNull();
  });
});

describe("what the signer refuses", () => {
  // the sentences of `Refusal` (src-tauri/src/signing/mod.rs), which the
  // tools say before the signer would
  const source = readFileSync(
    resolve(import.meta.dirname, "../../src-tauri/src/signing/mod.rs"),
    "utf8",
  );
  const refusal = (name: string) => {
    const match = new RegExp(`Refusal::${name} =>\\s*\\{?\\s*"([^"]*)"`).exec(
      source,
    );
    expect(match, name).not.toBeNull();
    return match![1];
  };

  it("is said in the same words", () => {
    expect(refusal("Restricted")).toBe(RESTRICTED);
    expect(refusal("Certified")).toBe(NO_CHANGES);
  });

  it("never says it can't yet", () => {
    expect(RESTRICTED).not.toMatch(/\byet\b/);
    expect(refusal("Restricted")).not.toMatch(/\byet\b/);
  });
});
