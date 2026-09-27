import { describe, expect, it } from "vitest";
import type { Command, EditorState } from "prosemirror-state";

import {
  createState,
  createTestView,
  doc,
  p,
  table,
  td,
  th,
  tr,
} from "../../../test/editor";
import {
  cellTexts,
  cellTypes,
  cursorAt,
  selectCells,
} from "../../../test/tables";
import {
  alignColumns,
  canMerge,
  mergeOrSplit,
  setCaption,
  toggleHeaderColumn,
  toggleHeaderRow,
} from "./format";

const run = (command: Command, state: EditorState) => {
  const view = createTestView(state);
  expect(command(view.state, view.dispatch)).toBe(true);
  return view.state;
};

const grid = () =>
  doc(
    table(
      tr(th("h1"), th("h2")),
      tr(td("a1"), td("a2")),
      tr(td("b1"), td("b2")),
    ),
    p(),
  );

const aligns = (state: EditorState) =>
  state.doc.firstChild!.children.map((row) =>
    row.children.map((cell) => cell.attrs.align),
  );

describe("alignColumns", () => {
  it("aligns the whole column, header included", () => {
    const state = run(alignColumns("right"), cursorAt(grid(), "a2"));

    expect(aligns(state)).toEqual([
      [null, "right"],
      [null, "right"],
      [null, "right"],
    ]);
  });

  it("aligns every selected column", () => {
    const state = run(
      alignColumns("center"),
      selectCells(cursorAt(grid(), "a1"), "a1", "a2"),
    );

    expect(aligns(state).flat()).toEqual(Array(6).fill("center"));
  });

  it("goes back to the default alignment when aligned that way already", () => {
    const once = run(alignColumns("left"), cursorAt(grid(), "b1"));
    const twice = run(alignColumns("left"), once);

    expect(aligns(twice).flat()).toEqual(Array(6).fill(null));
  });
});

describe("header row and column", () => {
  it("switches the header row off and on", () => {
    const off = run(toggleHeaderRow, cursorAt(grid(), "a1"));
    expect(cellTypes(off.doc)[0]).toEqual(["td", "td"]);

    const on = run(toggleHeaderRow, off);
    expect(cellTypes(on.doc)[0]).toEqual(["th", "th"]);
  });

  it("switches a header column on and off", () => {
    const on = run(toggleHeaderColumn, cursorAt(grid(), "a2"));
    expect(cellTypes(on.doc)).toEqual([
      ["th", "th"],
      ["th", "td"],
      ["th", "td"],
    ]);

    const off = run(toggleHeaderColumn, on);
    expect(cellTypes(off.doc)).toEqual(cellTypes(grid()));
  });

  it("keeps the corner a header cell while either is on", () => {
    const column = run(toggleHeaderColumn, cursorAt(grid(), "a2"));
    const noRow = run(toggleHeaderRow, column);

    expect(cellTypes(noRow.doc)).toEqual([
      ["th", "td"],
      ["th", "td"],
      ["th", "td"],
    ]);
  });

  it("needs a body for a header column", () => {
    const node = doc(table(tr(th("a"), th("b"))), p());

    expect(toggleHeaderColumn(cursorAt(node, "a"))).toBe(false);
  });

  it("does nothing outside tables", () => {
    const state = createState(doc(p("x")));

    expect(toggleHeaderRow(state)).toBe(false);
    expect(toggleHeaderColumn(state)).toBe(false);
    expect(alignColumns("left")(state)).toBe(false);
  });
});

describe("mergeOrSplit", () => {
  it("merges the selected cells, keeping their content", () => {
    const selected = selectCells(cursorAt(grid(), "a1"), "a1", "b1");
    expect(canMerge(selected)).toBe(true);

    const state = run(mergeOrSplit, selected);
    const merged = state.doc.firstChild!.child(1).firstChild!;
    expect(merged.attrs.rowspan).toBe(2);
    expect(merged.childCount).toBe(2);
  });

  it("splits a merged cell again", () => {
    const merged = run(
      mergeOrSplit,
      selectCells(cursorAt(grid(), "a1"), "a1", "a2"),
    );
    const state = run(mergeOrSplit, cursorAt(merged.doc, "a1"));

    expect(cellTexts(state.doc)[1]).toHaveLength(2);
  });

  it("does nothing to a single cell", () => {
    const state = cursorAt(grid(), "a1");

    expect(canMerge(state)).toBe(false);
    expect(mergeOrSplit(state)).toBe(false);
  });
});

describe("setCaption", () => {
  it("sets the caption, tidying its spaces, and removes an empty one", () => {
    const set = run(setCaption("  Fruit   stock "), cursorAt(grid(), "a1"));
    expect(set.doc.firstChild!.attrs.caption).toBe("Fruit stock");

    const removed = run(setCaption(" "), set);
    expect(removed.doc.firstChild!.attrs.caption).toBeNull();
  });

  it("does nothing outside tables", () => {
    expect(setCaption("x")(createState(doc(p("x"))))).toBe(false);
  });
});
