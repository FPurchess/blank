import { afterEach, describe, expect, it, vi } from "vitest";

import { documentFields } from "../layout/bands";
import { doc, h, p, table, td, tr } from "../test/editor";
import { schema } from "../markdown";
import { testEngine } from "../test/engine";
import { testLayout } from "../test/layout";
import {
  bootEngine,
  engineless,
  engineStatus,
  forgetEngineFailure,
  pageEngine,
  settingsOf,
} from "./engine";

const LONG =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.";

const noSizes = () => undefined;

const long = (count: number) =>
  doc(h(1, "Title"), ...Array.from({ length: count }, () => p(LONG)));

describe("PageEngine", () => {
  it("lays out the first pages of a long document first, then the rest", () => {
    vi.useFakeTimers();
    const node = long(300);
    const full = testEngine();
    full.setSettings(testLayout(), documentFields(node));
    full.sync(node, noSizes);

    const engine = testEngine();
    engine.setSettings(testLayout(), documentFields(node));
    let progress = 0;
    engine.onProgress = () => progress++;
    engine.sync(node, noSizes, { progressive: true });
    expect(engine.laying).toBe(true);
    expect(engine.pages()).toBeLessThan(full.pages());
    expect(engine.pages()).toBeGreaterThan(1);
    vi.runAllTimers();
    expect(engine.laying).toBe(false);
    expect(progress).toBeGreaterThan(1);
    expect(engine.pages()).toBe(full.pages());
    expect(engine.raw.bottoms()).toEqual(full.raw.bottoms());

    // an edit while it lays out finishes the rest first
    const again = testEngine();
    again.setSettings(testLayout(), documentFields(node));
    again.sync(node, noSizes, { progressive: true });
    const typed = node.replace(3, 3, doc(p("x")).slice(1, 2));
    again.sync(typed, noSizes);
    expect(again.laying).toBe(false);
    expect(again.pages()).toBe(full.pages());
    vi.useRealTimers();
  });

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

describe("bootEngine", () => {
  afterEach(() => {
    localStorage.removeItem("blank.engine");
    forgetEngineFailure();
  });

  it("starts Blank as a plain editor when the engine is switched off", async () => {
    localStorage.setItem("blank.engine", "off");
    const fetching = vi.fn();
    vi.stubGlobal("fetch", fetching);

    expect(await bootEngine()).toBeNull();

    expect(fetching).not.toHaveBeenCalled();
    expect(pageEngine).toBeNull();
    expect(engineless()).toBe(true);
    expect(engineStatus()).toBe("off");
    expect(document.body.classList).toContain("without-engine");
  });

  it("loads the engine when the storage can't be read", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    const fetching = vi.fn(async () => {
      throw new Error("offline");
    });
    vi.stubGlobal("fetch", fetching);

    await expect(bootEngine()).rejects.toThrow("offline");

    expect(fetching).toHaveBeenCalled();
    expect(engineStatus()).toBe("ready");
  });
});

describe("the body and the bands of a page", () => {
  it("are read again only when their own versions change", () => {
    const layout = {
      ...testLayout(),
      footer: { left: "", center: "Page {page}", right: "" },
    };
    const node = doc(p("Some text"));
    const engine = testEngine();
    engine.setSettings(layout, documentFields(node));
    engine.sync(node, noSizes);
    const body = engine.bodyDisplay(0, engine.bodyVersions()[0]);
    const bands = engine.bandDisplay(0, engine.bandVersions()[0]);
    expect(body.g.length).toBeGreaterThan(0);
    expect(bands.g.length).toBeGreaterThan(0);
    // the same page, both layers
    const glyphs = (display: { g: number[][] }) =>
      display.g.reduce((sum, run) => sum + (run.length - 3) / 3, 0);
    expect(glyphs(body) + glyphs(bands)).toBe(
      glyphs(engine.display(0, engine.versions()[0])),
    );

    const typed = doc(p("Some more text"));
    engine.sync(typed, noSizes);
    expect(engine.bandDisplay(0, engine.bandVersions()[0])).toBe(bands);
    expect(engine.bodyDisplay(0, engine.bodyVersions()[0])).not.toBe(body);
  });
});

describe("an image in a table cell", () => {
  // a table whose first cell holds an image of `size`, in points
  const laidOut = (size: { width: number; height: number }) => {
    const image = schema.nodes.image.create({ src: "x.png", alt: "x" });
    const node = doc(
      table(
        tr(
          td([schema.node("paragraph", null, [image])]),
          td("a much longer text in the second column of the table"),
        ),
      ),
    );
    const engine = testEngine();
    engine.setSettings(testLayout(), documentFields(node));
    engine.sync(node, (src) => (src === "x.png" ? size : undefined));
    const [shown] = engine.display(0, engine.versions()[0]).i;
    const grid = engine.tableGrid(0)!;
    return { engine, shown, cellWidth: grid.columns[1] - grid.columns[0] };
  };

  it("keeps the size of an image that fits its cell", () => {
    const { shown } = laidOut({ width: 3 * 0.75, height: 2 * 0.75 });
    expect(shown[0]).toBe("x.png");
    expect(shown[3]).toBeCloseTo(2.25);
    expect(shown[4]).toBeCloseTo(1.5);
  });

  it("fits a large image to its cell", () => {
    const { shown, cellWidth } = laidOut({ width: 3000, height: 750 });
    // the cell's width, less its padding
    expect(shown[3]).toBeLessThan(cellWidth);
    expect(shown[3]).toBeGreaterThan(cellWidth - 2 * 11);
    expect(shown[4]).toBeCloseTo(shown[3] / 4);
  });

  it("has a box, for a selection of it", () => {
    const { engine, shown } = laidOut({ width: 30, height: 20 });
    // the table, row, cell and paragraph open before it
    const [box] = engine.boxes(4, 5);
    expect(box).toMatchObject({ page: 0 });
    expect(box.width).toBeCloseTo(shown[3]);
  });
});
