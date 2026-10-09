import { describe, expect, it } from "vitest";

import { openDollar, opensMath, scanDollarMath } from "./scan";

const read = (text: string, at = text.indexOf("$")) =>
  scanDollarMath(text, at)?.source ?? null;

describe("scanDollarMath", () => {
  it("reads $…$", () => {
    expect(read("$x^2$")).toBe("x^2");
    expect(read("so $a + b$ is")).toBe("a + b");
    expect(scanDollarMath("a $x$ b", 2)).toEqual({
      from: 2,
      to: 5,
      source: "x",
      delim: "dollar",
    });
  });

  // the examples of pandoc's manual, tex_math_dollars
  it("keeps prices text", () => {
    expect(read("$5 and $10")).toBeNull();
    expect(read("it costs $ 5")).toBeNull();
    expect(read("$x $")).toBeNull();
    expect(read("$5-$10")).toBeNull();
    expect(read("$20,000 and $30,000")).toBeNull();
    expect(read("100$")).toBeNull();
  });

  it("closes at the first $ that isn't escaped, or not at all", () => {
    expect(read("$a \\$ b$")).toBe("a \\$ b");
    expect(read("$5 and $10 and 20$")).toBeNull();
    expect(read("\\$x$")).toBeNull();
    expect(read("\\\\$x$", 2)).toBe("x");
  });

  it("leaves $$ to display math", () => {
    expect(read("$$x$$")).toBeNull();
  });

  it("reads GitHub's $`…`$ and, when asked, \\(…\\)", () => {
    expect(scanDollarMath("$`a$b`$", 0)).toEqual({
      from: 0,
      to: 7,
      source: "a$b",
      delim: "backtick",
    });
    expect(scanDollarMath("\\(x\\)", 0)).toBeNull();
    expect(scanDollarMath("\\(x + 1\\)", 0, true)).toEqual({
      from: 0,
      to: 9,
      source: "x + 1",
      delim: "paren",
    });
  });

  it("tells which $ would open math", () => {
    expect(opensMath("$x$", 0)).toBe(true);
    expect(opensMath("$5 and $10", 0)).toBe(false);
  });
});

describe("openDollar", () => {
  it("finds an unclosed $ in the sentence", () => {
    expect(openDollar("so $f(x")).toBe(3);
    expect(openDollar("so $f(x) = ")).toBe(3);
  });

  it("forgets a price once the sentence ends", () => {
    expect(openDollar("It costs $5. Then")).toBe(-1);
    expect(openDollar("costs $ 5")).toBe(-1);
    expect(openDollar("I paid $5 for it")).toBe(-1);
    expect(openDollar("I paid $5")).toBe(-1);
    expect(openDollar("no dollar")).toBe(-1);
  });
});
