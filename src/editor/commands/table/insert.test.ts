import { describe, expect, it } from "vitest";
import { TextSelection } from "prosemirror-state";

import {
  createState,
  createTestView,
  doc,
  h,
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
  runCommand,
  selectCells,
  selectedText,
} from "../../../test/tables";
import { addColumns, addRows, createTable, insertTable } from "./insert";

describe("createTable", () => {
  it("creates a table with a header row", () => {
    expect(
      createTable(2, 3).eq(
        table(tr(th(), th()), tr(td(), td()), tr(td(), td())),
      ),
    ).toBe(true);
  });
});

describe("insertTable", () => {
  it("replaces an empty paragraph and puts the cursor in the first cell", () => {
    const view = createTestView(createState(doc(p("x"), p()), { cursor: 4 }));

    expect(insertTable(2, 2)(view.state, view.dispatch)).toBe(true);
    expect(view.state.doc.eq(doc(p("x"), createTable(2, 2)))).toBe(true);
    const { $head } = view.state.selection;
    expect($head.node(-1)).toBe(view.state.doc.child(1).firstChild!.firstChild);
  });

  it("goes after a block with text", () => {
    const view = createTestView(createState(doc(h(1, "Title")), { cursor: 3 }));

    insertTable(1, 2)(view.state, view.dispatch);
    expect(view.state.doc.eq(doc(h(1, "Title"), createTable(1, 2)))).toBe(true);
  });

  it("doesn't go into a table cell", () => {
    const node = doc(table(tr(th("a"))), p());
    const view = createTestView(createState(node, { cursor: 4 }));

    expect(insertTable(2, 2)(view.state, view.dispatch)).toBe(false);
    expect(view.state.doc.eq(node)).toBe(true);
  });

  it("tells whether it applies without a dispatch", () => {
    const state = createState(doc(p()), { cursor: 1 });

    expect(insertTable(2, 2)(state)).toBe(true);
  });
});

// a table with a header row, a right-aligned column and three rows
const grid = () =>
  doc(
    table(
      tr(th("h1"), th("h2", { align: "right" })),
      tr(td("a1"), td("a2", { align: "right" })),
      tr(td("b1"), td("b2", { align: "right" })),
    ),
    p(),
  );

describe("addRows", () => {
  it("adds a row below and puts the cursor in it", () => {
    const state = runCommand(addRows("below"), cursorAt(grid(), "a2"));

    expect(cellTexts(state.doc)).toEqual([
      ["h1", "h2"],
      ["a1", "a2"],
      ["", ""],
      ["b1", "b2"],
    ]);
    expect(state.selection).toBeInstanceOf(TextSelection);
    // in the same column as the cursor was, with the column's alignment
    expect(state.selection.$head.node(-1).attrs.align).toBe("right");
    expect(state.doc.firstChild!.child(2).child(0).attrs.align).toBeNull();
  });

  it("adds as many rows as are selected and selects them", () => {
    const state = runCommand(
      addRows("above"),
      selectCells(cursorAt(grid(), "a1"), "a1", "b2"),
    );

    expect(cellTexts(state.doc).map((row) => row.join())).toEqual([
      "h1,h2",
      ",",
      ",",
      "a1,a2",
      "b1,b2",
    ]);
    expect(selectedText(state)).toEqual(["", "", "", ""]);
  });

  it("adds body rows below the header", () => {
    const state = runCommand(addRows("below"), cursorAt(grid(), "h1"));

    expect(cellTypes(state.doc)[1]).toEqual(["td", "td"]);
  });

  it("adds nothing above the header row", () => {
    const state = cursorAt(grid(), "h1");

    expect(addRows("above")(state)).toBe(false);
  });

  it("gives a new row the header cell of a header column", () => {
    const node = doc(table(tr(th("h"), th("x")), tr(th("r"), td("v"))), p());
    const state = runCommand(addRows("below"), cursorAt(node, "v"));

    expect(cellTypes(state.doc)[2]).toEqual(["th", "td"]);
  });

  it("does nothing outside tables", () => {
    expect(addRows("below")(createState(doc(p("x"))))).toBe(false);
  });
});

describe("addColumns", () => {
  it("adds a column right, with a header cell in the header row", () => {
    const state = runCommand(addColumns("right"), cursorAt(grid(), "a1"));

    expect(cellTexts(state.doc)[0]).toEqual(["h1", "", "h2"]);
    expect(cellTypes(state.doc).map((row) => row[1])).toEqual([
      "th",
      "td",
      "td",
    ]);
    const newCell = state.doc.firstChild!.child(1).child(1);
    expect(state.selection.$head.node(-1)).toBe(newCell);
  });

  it("adds as many columns as are selected and selects them", () => {
    const state = runCommand(
      addColumns("left"),
      selectCells(cursorAt(grid(), "a1"), "a1", "a2"),
    );

    expect(cellTexts(state.doc)[1]).toEqual(["", "", "a1", "a2"]);
    expect(selectedText(state)).toHaveLength(6);
  });

  it("adds nothing left of a header column", () => {
    const node = doc(table(tr(th("h"), th("x")), tr(th("r"), td("v"))), p());

    expect(addColumns("left")(cursorAt(node, "r"))).toBe(false);
    expect(addColumns("left")(cursorAt(node, "v"))).toBe(true);
  });

  it("does nothing outside tables", () => {
    expect(addColumns("left")(createState(doc(p("x"))))).toBe(false);
  });
});
