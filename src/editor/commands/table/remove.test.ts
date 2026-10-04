import { describe, expect, it } from "vitest";

import { createState, doc, p, table, td, th, tr } from "../../../test/editor";
import {
  cellTexts,
  cellTypes,
  cursorAt,
  runCommand,
  selectCells,
  selectedText,
} from "../../../test/tables";
import { deleteColumns, deleteRows, deleteTable } from "./remove";

const grid = () =>
  doc(
    p("before"),
    table(
      tr(th("h1"), th("h2"), th("h3")),
      tr(td("a1"), td("a2"), td("a3")),
      tr(td("b1"), td("b2"), td("b3")),
    ),
    p("after"),
  );

describe("deleteRows", () => {
  it("deletes the row at the cursor and keeps the cursor in its column", () => {
    const state = runCommand(deleteRows, cursorAt(grid(), "a2"));

    expect(cellTexts(state.doc)).toEqual([
      ["h1", "h2", "h3"],
      ["b1", "b2", "b3"],
    ]);
    expect(selectedText(state)).toEqual(["b2"]);
  });

  it("deletes the selected rows", () => {
    const state = runCommand(
      deleteRows,
      selectCells(cursorAt(grid(), "a1"), "a1", "b1"),
    );

    expect(cellTexts(state.doc)).toEqual([["h1", "h2", "h3"]]);
  });

  it("makes the row below the header when the header row goes", () => {
    const state = runCommand(deleteRows, cursorAt(grid(), "h1"));

    expect(cellTexts(state.doc)[0]).toEqual(["a1", "a2", "a3"]);
    expect(cellTypes(state.doc)[0]).toEqual(["th", "th", "th"]);
  });

  it("deletes the table when all its rows go", () => {
    const state = runCommand(
      deleteRows,
      selectCells(cursorAt(grid(), "h1"), "h1", "b1"),
    );

    expect(state.doc.eq(doc(p("before"), p("after")))).toBe(true);
  });

  it("does nothing outside tables", () => {
    expect(deleteRows(createState(doc(p("x"))))).toBe(false);
  });
});

describe("deleteColumns", () => {
  it("deletes the column at the cursor", () => {
    const state = runCommand(deleteColumns, cursorAt(grid(), "a2"));

    expect(cellTexts(state.doc)[1]).toEqual(["a1", "a3"]);
    expect(selectedText(state)).toEqual(["a3"]);
  });

  it("deletes the selected columns", () => {
    const state = runCommand(
      deleteColumns,
      selectCells(cursorAt(grid(), "a1"), "a2", "a3"),
    );

    expect(cellTexts(state.doc)).toEqual([["h1"], ["a1"], ["b1"]]);
    expect(selectedText(state)).toEqual(["a1"]);
  });

  it("deletes the table when all its columns go", () => {
    const state = runCommand(
      deleteColumns,
      selectCells(cursorAt(grid(), "a1"), "a1", "a3"),
    );

    expect(state.doc.eq(doc(p("before"), p("after")))).toBe(true);
  });

  it("does nothing outside tables", () => {
    expect(deleteColumns(createState(doc(p("x"))))).toBe(false);
  });
});

describe("deleteTable", () => {
  it("deletes the table and puts the cursor where it was", () => {
    const state = runCommand(deleteTable, cursorAt(grid(), "b3"));

    expect(state.doc.eq(doc(p("before"), p("after")))).toBe(true);
    expect(state.selection.$head.parent.textContent).toBe("after");
  });

  it("leaves an empty paragraph where the table was all there was", () => {
    const state = runCommand(
      deleteTable,
      cursorAt(doc(table(tr(th("a")))), "a"),
    );

    expect(state.doc.eq(doc(p()))).toBe(true);
  });

  it("does nothing outside tables", () => {
    expect(deleteTable(createState(doc(p("x"))))).toBe(false);
  });
});
