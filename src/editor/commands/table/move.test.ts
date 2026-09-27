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
  cursorAt,
  selectCells,
  selectedText,
} from "../../../test/tables";
import { moveColumns, moveRows } from "./move";

const run = (command: Command, state: EditorState) => {
  const view = createTestView(state);
  expect(command(view.state, view.dispatch)).toBe(true);
  return view.state;
};

const grid = () =>
  doc(
    table(
      tr(th("h1"), th("h2"), th("h3")),
      tr(td("a1"), td("a2"), td("a3")),
      tr(td("b1"), td("b2"), td("b3")),
      tr(td("c1"), td("c2"), td("c3")),
    ),
    p(),
  );

describe("moveRows", () => {
  it("moves the row at the cursor down, and the cursor with it", () => {
    const state = run(moveRows(1), cursorAt(grid(), "a2"));

    expect(cellTexts(state.doc).map((row) => row[0])).toEqual([
      "h1",
      "b1",
      "a1",
      "c1",
    ]);
    expect(selectedText(state)).toEqual(["a2"]);
  });

  it("moves the selected rows up as a block", () => {
    const state = run(
      moveRows(-1),
      selectCells(cursorAt(grid(), "b1"), "b1", "c3"),
    );

    expect(cellTexts(state.doc).map((row) => row[0])).toEqual([
      "h1",
      "b1",
      "c1",
      "a1",
    ]);
    expect(selectedText(state)).toEqual(["b1", "b2", "b3", "c1", "c2", "c3"]);
  });

  it("keeps rows below the header and the header on top", () => {
    expect(moveRows(-1)(cursorAt(grid(), "a1"))).toBe(false);
    expect(moveRows(1)(cursorAt(grid(), "h1"))).toBe(false);
    expect(moveRows(1)(cursorAt(grid(), "c1"))).toBe(false);
  });

  it("does nothing outside tables", () => {
    expect(moveRows(1)(createState(doc(p("x"))))).toBe(false);
  });
});

describe("moveColumns", () => {
  it("moves the column at the cursor right, and the cursor with it", () => {
    const state = run(moveColumns(1), cursorAt(grid(), "b1"));

    expect(cellTexts(state.doc)[0]).toEqual(["h2", "h1", "h3"]);
    expect(selectedText(state)).toEqual(["b1"]);
  });

  it("moves the selected columns left as a block", () => {
    const state = run(
      moveColumns(-1),
      selectCells(cursorAt(grid(), "a2"), "a2", "a3"),
    );

    expect(cellTexts(state.doc)[1]).toEqual(["a2", "a3", "a1"]);
  });

  it("stops at the edges", () => {
    expect(moveColumns(-1)(cursorAt(grid(), "a1"))).toBe(false);
    expect(moveColumns(1)(cursorAt(grid(), "a3"))).toBe(false);
  });

  it("keeps a header column first", () => {
    const node = doc(
      table(tr(th("h"), th("x"), th("y")), tr(th("r"), td("v"), td("w"))),
      p(),
    );

    expect(moveColumns(1)(cursorAt(node, "r"))).toBe(false);
    expect(moveColumns(-1)(cursorAt(node, "v"))).toBe(false);
    expect(moveColumns(1)(cursorAt(node, "v"))).toBe(true);
  });

  it("does nothing outside tables", () => {
    expect(moveColumns(1)(createState(doc(p("x"))))).toBe(false);
  });
});
