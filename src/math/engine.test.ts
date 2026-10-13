import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { flatten } from "../engine/flatten";
import { documentFields } from "../layout/bands";
import { parseMarkdown, schema } from "../markdown";
import { noSizes, testEngine } from "../test/engine";
import { testLayout } from "../test/layout";
import { displayMath, inlineMath, withMathFonts } from "../test/math";
import { withMathOf } from "../test/mathModule";
import { registerMath } from "./register";
import { Fragment, Slice } from "prosemirror-model";

// the real engine with the KaTeX fonts: what the pages and the preview get

const laidOut = async (markdown: string) => {
  const doc = parseMarkdown(markdown);
  const engine = await withMathOf(withMathFonts(testEngine()), doc);
  engine.setSettings(testLayout(), documentFields(doc));
  engine.sync(doc, noSizes);
  return engine;
};

// an engine with the math fonts and the module's drawing of `latex`
const drawing = async (latex: string, display: boolean) =>
  withMathOf(
    withMathFonts(testEngine()),
    schema.node("doc", null, [
      display
        ? displayMath(latex)
        : schema.node("paragraph", null, [inlineMath(latex)]),
    ]),
  );

describe("math on the pages", () => {
  // math as the editor registers it, which flatten sets display math by
  let unregister = () => {};
  beforeEach(() => {
    unregister = registerMath();
  });
  afterEach(() => unregister());

  it("sets a formula on its own for the preview", async () => {
    const engine = await drawing("\\sqrt{x^2 + 1}", false);
    const laid = engine.mathLayout("\\sqrt{x^2 + 1}", false);
    expect(laid.ok).toBe(true);
    if (laid.ok !== true) return;
    expect(laid.width).toBeGreaterThan(10);
    expect(laid.display.g.length).toBeGreaterThan(0);
    // the radical's sign is a glyph, its bar a path
    expect(laid.display.p?.length).toBeGreaterThan(0);
  });

  it("says what's wrong with a formula", async () => {
    const engine = await drawing("\\nope", false);
    expect(engine.mathLayout("\\nope", false)).toMatchObject({
      ok: false,
      line: 1,
      column: 1,
    });
  });

  it("waits for its fonts", () => {
    expect(testEngine().mathLayout("x", false)).toEqual({ ok: "nofonts" });
  });

  it("draws inline and display math with the math fonts", async () => {
    const engine = await laidOut(
      "So $\\frac{a}{b}$ is.\n\n$$\n\\left(\\sum_{i=1}^n i\\right)^2\n$$ {#eq-a}",
    );
    const page = engine.bodyDisplay(0, -1);
    // glyphs of more fonts than the 14 of the text
    const fonts = new Set(page.g.map((run) => run[0]));
    expect([...fonts].some((font) => font >= 14)).toBe(true);
    // and nothing missing
    expect(engine.missing()).toBe("");
  });

  it("numbers display math", async () => {
    const engine = await laidOut(
      "$$\na\n$$ {#eq-a}\n\n$$\nb\n$$\n\n$$\nc\n$$ {#eq-c}",
    );
    const doc = parseMarkdown(
      "$$\na\n$$ {#eq-a}\n\n$$\nb\n$$\n\n$$\nc\n$$ {#eq-c}",
    );
    const positions: number[] = [];
    doc.forEach((node, offset) => {
      if (node.attrs.label) positions.push(offset);
    });
    expect(engine.mathNumbers()).toEqual([
      [positions[0], 1],
      [positions[1], 2],
    ]);
  });

  it("flattens inline math as characters of no width", () => {
    const doc = parseMarkdown("a $x$ b");
    const [item] = flatten(doc, noSizes).map((record) => record.build());
    expect(item).toMatchObject({
      kind: "text",
      text: "a ⁠⁠⁠ b",
      spans: [{ from: 2, to: 5, math: "x" }],
    });
    // while it's open, its source between faint $s
    const open = flatten(doc, noSizes, null, { inline: 3 }).map((record) =>
      record.build(),
    );
    expect(open[0]).toMatchObject({
      text: "a $x$ b",
      spans: [
        { from: 2, to: 3, code: true, dim: true },
        { from: 3, to: 4, code: true },
        { from: 4, to: 5, code: true, dim: true },
      ],
    });
    expect(schema.nodes.math_inline).toBeDefined();
  });

  it("shows the source of display math open in a table's cell", () => {
    const doc = parseMarkdown("| a |\n| --- |\n| b |\n");
    // display math into the body cell's paragraph
    let cell = -1;
    doc.descendants((node, pos) => {
      if (node.type.name === "paragraph" && node.textContent === "b") {
        cell = pos;
      }
    });
    const withMath = doc.replace(
      cell,
      cell + 3,
      new Slice(Fragment.from(displayMath("x^2")), 0, 0),
    );
    const blocksOf = (open?: number) => {
      const [table] = flatten(withMath, noSizes, null, { open }).map((record) =>
        record.build(),
      );
      return (table as { rows: { cells: { blocks: object[] }[] }[] }).rows[1]
        .cells[0].blocks;
    };
    expect(blocksOf()).toMatchObject([{ kind: "math", latex: "x^2" }]);
    expect(blocksOf(cell)).toMatchObject([
      // its text from the first character, as the caret counts it
      { kind: "text", style: "code", text: "x^2", pos: cell + 2 },
      { kind: "math", pos: cell + 6 },
    ]);
    // the table is laid out again as the source opens
    const keyOf = (open?: number) =>
      flatten(withMath, noSizes, null, { open })[0].key;
    expect(keyOf(cell)).not.toBe(keyOf());
  });
});
