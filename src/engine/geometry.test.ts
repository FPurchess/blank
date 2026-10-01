import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { pageSync } from "../editor/plugins/pageView";
import { schema } from "../markdown";
import { pageViewport } from "../state";
import { doc, p, table, td, th, tr } from "../test/editor";
import { hidePages, showPages, TEST_VIEWPORT } from "../test/engine";
import {
  blockBoxes,
  caretBox,
  caretPage,
  findText,
  hitAt,
  rangeRects,
  setGeometryView,
  tableGeometry,
  viewBox,
} from "./geometry";
import { forgetEngineFailure, useFallbackEditor } from "./engine";

const LONG =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.";

// "intro" at 0, the table at 7, then 60 long paragraphs over some pages
const node = doc(
  p("intro"),
  table(tr(th("a"), th("b")), tr(td("c"), td("d"))),
  ...Array.from({ length: 60 }, () => p(LONG)),
);

describe("geometry", () => {
  let view: EditorView;

  beforeEach(() => {
    showPages("pages");
    view = new EditorView(document.createElement("div"), {
      state: EditorState.create({ schema, doc: node, plugins: [pageSync()] }),
    });
  });

  afterEach(() => {
    view.destroy();
    hidePages();
  });

  it("gives the caret in the window, and hits it back", () => {
    const caret = caretBox(3)!;
    expect(caret.left).toBeGreaterThan(TEST_VIEWPORT.left);
    expect(caret.bottom).toBeGreaterThan(caret.top);
    expect(caret.right).toBe(caret.left);
    expect(hitAt(caret.left, (caret.top + caret.bottom) / 2)).toEqual({
      node: false,
      pos: 3,
    });
    expect(caretPage(3)).toBe(0);
  });

  it("follows the scrolling", () => {
    const before = caretBox(3)!;
    pageViewport.value = { ...TEST_VIEWPORT, scrollTop: 100 };
    expect(caretBox(3)!.top).toBeCloseTo(before.top - 100);
  });

  it("gives the rectangles of a range and the boxes of blocks", () => {
    const rects = rangeRects(1, 6);
    expect(rects).toHaveLength(1);
    expect(rects[0].right).toBeGreaterThan(rects[0].left);
    const [intro] = blockBoxes(0, 7);
    expect(intro.page).toBe(0);
    expect(intro.top).toBeLessThanOrEqual(rects[0].top);
    // the paragraphs are on several pages, one box each
    const pages = blockBoxes(0, node.content.size);
    expect(pages.length).toBeGreaterThan(1);
    expect(new Set(pages.map((box) => box.page)).size).toBe(pages.length);
    expect(pages[1].top).toBeGreaterThan(pages[0].bottom);
  });

  it("gives a table's rows and columns", () => {
    const grid = tableGeometry(7)!;
    expect(grid.rowCount).toBe(2);
    expect(grid.pieces).toHaveLength(1);
    const [piece] = grid.pieces;
    expect(piece.rows).toHaveLength(3);
    expect(piece.columns).toHaveLength(3);
    expect(piece.box.top).toBe(piece.rows[0]);
    expect(tableGeometry(0)).toBeNull();
  });

  it("measures nothing while the pages aren't shown", () => {
    pageViewport.value = null;
    expect(caretBox(3)).toBeNull();
    expect(rangeRects(1, 6)).toEqual([]);
    expect(blockBoxes(0, 7)).toEqual([]);
    expect(tableGeometry(7)).toBeNull();
    expect(hitAt(10, 10)).toBeNull();
    expect(viewBox()).toBeNull();
  });
});

describe("findText", () => {
  it("finds where a text starts, counting leaves as positions", () => {
    const image = schema.nodes.image.create({ src: "a.png" });
    const node = doc(
      p("intro"),
      schema.node("paragraph", null, [
        schema.text("ab"),
        image,
        schema.text("cd cd"),
      ]),
    );
    expect(findText(node, "intro")).toBe(1);
    // the second paragraph's text starts at 8; the image takes 10
    expect(findText(node, "cd")).toBe(11);
    expect(findText(node, "cd", 1)).toBe(14);
    expect(findText(node, "nothing")).toBe(-1);
  });
});

describe("geometry without the engine", () => {
  let view: EditorView;
  const box = new DOMRect(10, 20, 100, 40);

  beforeEach(() => {
    useFallbackEditor("unavailable");
    view = new EditorView(document.createElement("div"), {
      state: EditorState.create({ schema, doc: node }),
    });
    setGeometryView(view);
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(box);
  });
  afterEach(() => {
    view.destroy();
    setGeometryView(null);
    forgetEngineFailure();
  });

  it("measures the caret in the editor, which shows the text itself", () => {
    vi.spyOn(view, "coordsAtPos").mockReturnValue({
      left: 5,
      right: 6,
      top: 1,
      bottom: 11,
    });
    expect(caretBox(3)).toEqual({ left: 5, top: 1, right: 5, bottom: 11 });
    expect(view.coordsAtPos).toHaveBeenCalledWith(3, 1);
    caretBox(3, true);
    expect(view.coordsAtPos).toHaveBeenLastCalledWith(3, -1);
    expect(caretPage(3)).toBe(0);
  });

  it("has no caret where the editor can't measure one", () => {
    vi.spyOn(view, "coordsAtPos").mockImplementation(() => {
      throw new Error("Invalid position");
    });
    expect(caretBox(3)).toBeNull();
  });

  it("measures the text of a range", () => {
    // jsdom lays nothing out
    Range.prototype.getClientRects = () =>
      [new DOMRect(1, 2, 3, 4)] as unknown as DOMRectList;
    try {
      expect(rangeRects(1, 4)).toEqual([
        { left: 1, top: 2, right: 4, bottom: 6 },
      ]);
    } finally {
      delete (Range.prototype as Partial<Range>).getClientRects;
    }
  });

  it("measures blocks and tables", () => {
    expect(blockBoxes(0, 7)).toEqual([
      { page: 0, left: 10, top: 20, right: 110, bottom: 60 },
    ]);
    const table = tableGeometry(7)!;
    expect(table.rowCount).toBe(2);
    expect(table.pieces).toHaveLength(1);
    expect(table.pieces[0]).toMatchObject({
      page: 0,
      firstRow: 0,
      box: { left: 10, top: 20, right: 110, bottom: 60 },
      rows: [20, 20, 60],
      columns: [10, 10, 110],
    });
    expect(tableGeometry(0)).toBeNull();
  });

  it("hits a position or a node", () => {
    const hit = vi.spyOn(view, "posAtCoords");
    hit.mockReturnValue({ pos: 3, inside: -1 });
    expect(hitAt(50, 30)).toEqual({ node: false, pos: 3 });
    hit.mockReturnValue(null);
    expect(hitAt(50, 30)).toBeNull();
  });

  it("measures nothing while the engine runs but the pages aren't shown", () => {
    forgetEngineFailure();
    expect(caretBox(3)).toBeNull();
    expect(caretPage(3)).toBeNull();
    expect(blockBoxes(0, 7)).toEqual([]);
    expect(hitAt(50, 30)).toBeNull();
  });
});
