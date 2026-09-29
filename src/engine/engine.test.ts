import { describe, expect, it } from "vitest";

import { documentFields } from "../layout/bands";
import { doc, h, p } from "../test/editor";
import { testEngine } from "../test/engine";
import { testLayout } from "../test/layout";
import { settingsOf } from "./engine";

const LONG =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.";

const noSizes = () => undefined;

const long = (count: number) =>
  doc(h(1, "Title"), ...Array.from({ length: count }, () => p(LONG)));

describe("PageEngine", () => {
  it("lays out a document on pages", () => {
    const engine = testEngine();
    const node = long(60);
    engine.setSettings(testLayout(), documentFields(node));
    engine.sync(node, noSizes);
    expect(engine.pages()).toBeGreaterThan(2);
    const display = engine.display(0, engine.raw.versions()[0]);
    expect(display.g.length).toBeGreaterThan(20);
    // the same version is read only once
    expect(engine.display(0, engine.raw.versions()[0])).toBe(display);
  });

  it("follows edits, keeping the pages after them", () => {
    const engine = testEngine();
    const node = long(80);
    engine.setSettings(testLayout(), documentFields(node));
    engine.sync(node, noSizes);
    const versions = engine.raw.versions();
    // type into the tenth paragraph
    const pos = 7 + 9 * (LONG.length + 2) + 3;
    const typed = node.replace(pos, pos, doc(p("x")).slice(1, 2));
    expect(engine.sync(typed, noSizes)).toBe(true);
    expect(engine.sync(typed, noSizes)).toBe(false);
    const [laidOut] = engine.raw.stats();
    expect(laidOut).toBe(1);
    const after = engine.raw.versions();
    expect(after[after.length - 1]).toBe(versions[versions.length - 1]);
    // and the caret is where the text is
    const caret = engine.caret(pos + 1)!;
    expect(
      engine.hit(caret.page, caret.x + 0.1, caret.y + caret.height / 2),
    ).toEqual({
      node: false,
      pos: pos + 1,
    });
  });

  it("fills in headers and footers", () => {
    const engine = testEngine();
    const node = long(60);
    const layout = testLayout({
      footer: { left: "", center: "{page} of {pages}", right: "" },
    });
    expect(engine.setSettings(layout, documentFields(node))).toBe(true);
    expect(engine.setSettings(layout, documentFields(node))).toBe(false);
    engine.sync(node, noSizes);
    expect(engine.bands(1)[4]).toBe(`2 of ${engine.pages()}`);
  });

  it("moves between lines, finds words and line edges", () => {
    const engine = testEngine();
    const node = doc(p(LONG));
    engine.setSettings(testLayout(), documentFields(node));
    engine.sync(node, noSizes);
    const caret = engine.caret(5)!;
    const down = engine.vertical(5, true, caret.x)!;
    expect(engine.caret(down.pos)!.y).toBeGreaterThan(caret.y);
    expect(engine.lineEdge(5, false)).toBe(1);
    expect(engine.word(0, caret.x, caret.y + 2)).toEqual({ from: 1, to: 6 });
    expect(engine.selection(1, 100).length).toBeGreaterThan(0);
    expect(engine.unitsPerEm(0)).toBe(1000);
  });

  it("writes the PDF", () => {
    const engine = testEngine();
    const node = long(3);
    engine.setSettings(testLayout(), documentFields(node));
    engine.sync(node, noSizes);
    const pdf = engine.raw.pdf("Title", "");
    expect(new TextDecoder().decode(pdf.slice(0, 5))).toBe("%PDF-");
  });

  it("turns a layout into the engine's settings", () => {
    const settings = settingsOf(testLayout({ newPageBefore: [1] }), {
      title: "T",
      author: "",
      date: "",
      file: "",
    });
    expect(settings).toMatchObject({
      newPageBefore: [1],
      fields: { title: "T" },
      numberStyle: "1",
    });
    expect(settings.width).toBeCloseTo(595.28, 1);
  });
});
