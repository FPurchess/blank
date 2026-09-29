import { EditorState } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { pageSync } from "../editor/plugins/pageView";
import { schema } from "../markdown";
import { pageViewport } from "../state";
import { doc, p, table, td, th, tr } from "../test/editor";
import { hidePages, showPages, TEST_VIEWPORT } from "../test/engine";
import {
  blockBoxes,
  caretBox,
  caretPage,
  hitAt,
  rangeRects,
  tableGeometry,
  viewBox,
} from "./geometry";

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
