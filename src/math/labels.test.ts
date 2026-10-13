import { describe, expect, it } from "vitest";

import { freeEquationIdIn, unnumbered } from "./labels";

describe("equation labels", () => {
  it("finds an id not taken", () => {
    expect(freeEquationIdIn(new Set())).toBe("eq-1");
    expect(freeEquationIdIn(new Set(["eq-1", "eq-3"]))).toBe("eq-2");
  });

  it("knows a formula that tags itself or has no number, as the engine does", () => {
    expect(unnumbered("a \\tag{1}")).toBe(true);
    expect(unnumbered("a \\tag*{x}")).toBe(true);
    expect(unnumbered("a \\tag{1} % \\notag")).toBe(true);
    expect(unnumbered("a = b \\notag")).toBe(true);
    expect(unnumbered("a = b \\nonumber")).toBe(true);
    expect(unnumbered("a % comment\n\\tag{2}")).toBe(true);
    expect(unnumbered("a \\tagged{1}")).toBe(false);
    expect(unnumbered("a = b \\nonumbered")).toBe(false);
    expect(unnumbered("a % \\tag{1}\n+ b")).toBe(false);
    expect(unnumbered("a \\% \\\\tag")).toBe(false);
    expect(unnumbered("a \\\\tag")).toBe(false);
  });
});
