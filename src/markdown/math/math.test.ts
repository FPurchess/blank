import type { Node } from "prosemirror-model";
import { describe, expect, it } from "vitest";

import { parseMarkdown, serializeMarkdown } from "../index";
import { schema } from "../schema";
import { escapeDollars } from "./serialize";

const roundTrip = (markdown: string) =>
  serializeMarkdown(parseMarkdown(markdown)).trim();

const maths = (doc: Node) => {
  const found: { type: string; source: string; attrs: object }[] = [];
  doc.descendants((node) => {
    if (
      node.type.name.startsWith("math_") &&
      node.type.name !== "math_display_source"
    ) {
      found.push({
        type: node.type.name,
        source: node.textContent,
        attrs: node.attrs,
      });
    }
  });
  return found;
};

describe("math in markdown", () => {
  it("reads every way of writing it", () => {
    const doc = parseMarkdown(
      [
        "a $x^2$ b $`y$z`$ c \\(w\\) d",
        "",
        "$$\nE = mc^2\n$$",
        "",
        "$$a + b$$",
        "",
        "```math\nf(x)\n```",
      ].join("\n"),
    );
    expect(maths(doc).map(({ type, source }) => [type, source])).toEqual([
      ["math_inline", "x^2"],
      ["math_inline", "y$z"],
      ["math_inline", "w"],
      ["math_display", "E = mc^2"],
      ["math_display", "a + b"],
      ["math_display", "f(x)"],
    ]);
  });

  it("writes it back as it was written", () => {
    for (const markdown of [
      "a $x^2$ b",
      "a $`y$z`$ b",
      "$$\nE = mc^2\n$$",
      "$$\nE = mc^2\n$$ {#eq-mass}",
      "```math\nf(x)\n```",
      "* item\n\n  $$\n  x\n  $$",
      "> $$\n> x\n> $$",
      "**bold $x$**",
    ]) {
      expect(roundTrip(markdown)).toBe(markdown);
    }
  });

  it("writes \\(…\\) for a source $…$ can't hold", () => {
    expect(roundTrip("\\( x \\)")).toBe("\\( x \\)");
    expect(roundTrip("\\(a\\$b\\)")).toBe("$a\\$b$");
  });

  it("keeps the label of a numbered equation", () => {
    const [math] = maths(parseMarkdown("$$\nx\n$$ {#eq-a}"));
    expect(math.attrs).toMatchObject({ label: "eq-a" });
  });

  it("doesn't read \\[…\\], which Blank writes for brackets", () => {
    const doc = parseMarkdown("\\[see note\\]");
    expect(maths(doc)).toEqual([]);
    expect(roundTrip("\\[see note\\]")).toBe("\\[see note\\]");
  });

  it("keeps prices as they were typed", () => {
    for (const markdown of [
      "It costs $5 and $10.",
      "100$ and 200$",
      "From $5-$10",
      "$20,000 or $30,000",
    ]) {
      expect(roundTrip(markdown)).toBe(markdown);
      expect(maths(parseMarkdown(markdown))).toEqual([]);
    }
  });

  it("escapes a $ of text that would read as math", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("a $x$ b")]),
    ]);
    const markdown = serializeMarkdown(doc).trim();
    expect(markdown).toBe("a \\$x$ b");
    expect(maths(parseMarkdown(markdown))).toEqual([]);
    expect(parseMarkdown(markdown).textContent).toBe("a $x$ b");
  });

  it("escapes every $ of a long text that would read as math", () => {
    const text = "a $x$ b ".repeat(80) + "$$y$ z";
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text(text)]),
    ]);
    const again = parseMarkdown(serializeMarkdown(doc));
    expect(maths(again)).toEqual([]);
    expect(again.textContent).toBe(text);
  });

  it("escapes a $ of text before math", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("$a "),
        schema.node("math_inline", null, [schema.text("x")]),
        schema.text(" b$"),
      ]),
    ]);
    const markdown = serializeMarkdown(doc).trim();
    expect(maths(parseMarkdown(markdown)).map((math) => math.source)).toEqual([
      "x",
    ]);
    expect(parseMarkdown(markdown).textContent).toBe("$a x b$");
  });

  it("leaves a $ in code and links alone", () => {
    for (const markdown of [
      "`$x$` and $5",
      "[a](http://example.com/$x$)",
      "<http://example.com/$x$>",
    ]) {
      expect(roundTrip(markdown)).toBe(markdown);
    }
  });

  it("escapes a line of text starting with $$", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [schema.text("$$5 off")]),
    ]);
    const markdown = serializeMarkdown(doc).trim();
    expect(maths(parseMarkdown(markdown))).toEqual([]);
    expect(parseMarkdown(markdown).textContent).toBe("$$5 off");
  });

  it("keeps |x| in a table's cell", () => {
    const markdown = "| a |\n| --- |\n| $\\|x\\|$ and $\\\\|y\\\\|$ |";
    const doc = parseMarkdown(markdown);
    expect(maths(doc).map((math) => math.source)).toEqual(["|x|", "\\|y\\|"]);
    expect(
      maths(parseMarkdown(serializeMarkdown(doc))).map((math) => math.source),
    ).toEqual(["|x|", "\\|y\\|"]);
  });

  it("reads and writes $$…$$ in a table's cell", () => {
    const markdown = "| a     |\n| ----- |\n| $$x$$ |";
    expect(maths(parseMarkdown(markdown))).toEqual([
      { type: "math_inline", source: "x", attrs: { delim: "display" } },
    ]);
    expect(roundTrip(markdown)).toBe(markdown);
  });

  it("keeps a source ending in $ that was written as $$…$$", () => {
    const doc = schema.node("doc", null, [
      schema.node("paragraph", null, [
        schema.text("a "),
        schema.node("math_inline", { delim: "display" }, [schema.text("x\\$")]),
        schema.text(" b"),
      ]),
    ]);
    const again = parseMarkdown(serializeMarkdown(doc));
    expect(maths(again).map((math) => math.source)).toEqual(["x\\$"]);
  });

  it("keeps any source of display math through a save", () => {
    const display = (source: string, label: string | null = null) =>
      schema.node("doc", null, [
        schema.node("math_display", { label }, [
          schema.node("math_display_source", null, [schema.text(source)]),
        ]),
      ]);
    for (const source of [
      "a\n\nb",
      "a = b $$\nc",
      "x\n  $$ y",
      "\\begin{aligned}\n  a &= b \\\\\n  c &= d\n\\end{aligned}",
    ]) {
      const again = parseMarkdown(serializeMarkdown(display(source)));
      expect(maths(again), JSON.stringify(source)).toMatchObject([
        { type: "math_display", source },
      ]);
    }
    // in a list, its lines keep their indentation within the item
    const listed = parseMarkdown("- item\n\n  $$\n  a\n    b\n  $$\n");
    expect(maths(listed)).toMatchObject([{ source: "a\n  b" }]);
    // a label, which a fence can't hold: blank lines are left out
    const numbered = parseMarkdown(
      serializeMarkdown(display("a\n\nb", "eq-1")),
    );
    expect(maths(numbered)).toMatchObject([
      { source: "a\nb", attrs: { label: "eq-1" } },
    ]);
  });

  it("round-trips any text of dollars, digits and markup", () => {
    const alphabet = [
      "$",
      "\\",
      "5",
      "a",
      " ",
      "`",
      "[",
      "]",
      "(",
      ")",
      "*",
      "_",
    ];
    let seed = 7;
    const random = () => {
      seed = (seed * 16807) % 2147483647;
      return seed / 2147483647;
    };
    for (let round = 0; round < 400; round++) {
      let text = "";
      const length = 1 + Math.floor(random() * 12);
      for (let index = 0; index < length; index++) {
        text += alphabet[Math.floor(random() * alphabet.length)];
      }
      const doc = schema.node("doc", null, [
        schema.node("paragraph", null, [schema.text(text)]),
      ]);
      const again = parseMarkdown(serializeMarkdown(doc));
      expect(maths(again), JSON.stringify(text)).toEqual([]);
    }
  });
});

describe("escapeDollars", () => {
  it("drops the marks around math", () => {
    expect(escapeDollars("$x$ and $y$")).toBe("$x$ and \\$y$");
  });
});
