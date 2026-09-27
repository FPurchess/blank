import { describe, expect, it } from "vitest";
import { CellSelection, selectedRect } from "prosemirror-tables";

import { schema } from "../../../markdown";
import { doc, p, table, td, th, tr } from "../../../test/editor";
import { cellTypes, cursorAt, selectedText } from "../../../test/tables";
import {
  cellsOfColumns,
  hasHeaderColumn,
  hasHeaderRow,
  refreshed,
  repeated,
  selectCells,
  selectIn,
  sequence,
  setCellType,
  tableAt,
  transactionOf,
} from "./rect";
import { addRows } from "./insert";
import { deleteTable } from "./remove";

const grid = () =>
  doc(
    table(
      tr(th("a"), th("b"), th("c")),
      tr(th("d"), td("e", { colspan: 2 })),
      tr(th("f"), td("g"), td("h")),
    ),
    p("outro"),
  );

const rectAt = (text: string, node = grid()) =>
  selectedRect(cursorAt(node, text));

describe("table rect helpers", () => {
  it("tells whether a table has a header row and a header column", () => {
    expect(hasHeaderRow(rectAt("g"))).toBe(true);
    expect(hasHeaderColumn(rectAt("g"))).toBe(true);

    const plain = doc(table(tr(td("a"), td("b")), tr(td("c"), td("d"))));
    expect(hasHeaderRow(rectAt("a", plain))).toBe(false);
    expect(hasHeaderColumn(rectAt("a", plain))).toBe(false);

    // a table of header cells only has a header row, but no header column
    const headers = doc(table(tr(th("a"), th("b"))));
    expect(hasHeaderRow(rectAt("a", headers))).toBe(true);
    expect(hasHeaderColumn(rectAt("a", headers))).toBe(false);
  });

  it("lists each cell of some columns once, merged cells included", () => {
    const rect = rectAt("g");
    const texts = (left: number, right: number) =>
      cellsOfColumns(rect, left, right).map(
        (pos) => grid().nodeAt(pos)!.textContent,
      );

    expect(texts(1, 2)).toEqual(["b", "e", "g"]);
    expect(texts(1, 3)).toEqual(["b", "c", "e", "g", "h"]);
  });

  it("selects cells, or puts the cursor in a single one", () => {
    const state = cursorAt(grid(), "g");
    const rect = selectedRect(state);

    const cells = selectCells(state.tr, rect, {
      top: 0,
      bottom: 1,
      left: 0,
      right: 2,
    });
    expect(cells.selection).toBeInstanceOf(CellSelection);
    expect(selectedText(state.apply(cells))).toEqual(["a", "b"]);

    const cell = selectCells(state.tr, rect, {
      top: 2,
      bottom: 3,
      left: 2,
      right: 3,
    });
    expect(cell.selection.empty).toBe(true);
    expect(selectedText(state.apply(cell))).toEqual(["h"]);
  });

  it("changes the type of a cell and follows the table through changes", () => {
    const state = cursorAt(grid(), "g");
    const rect = selectedRect(state);
    const tr = state.tr;
    setCellType(tr, rect.tableStart + rect.map.map[6], schema.nodes.table_cell);
    setCellType(tr, rect.tableStart + rect.map.map[7], schema.nodes.table_cell);

    expect(cellTypes(tr.doc)[2]).toEqual(["td", "td", "td"]);
    expect(refreshed(tr, rect).table).toBe(tr.doc.firstChild);
    expect(tr.steps).toHaveLength(1);
  });

  it("finds a table by where it starts", () => {
    expect(tableAt(grid(), 1)!.childCount).toBe(3);
    expect(tableAt(grid(), 0)).toBeNull();
    expect(tableAt(grid(), 2)).toBeNull();
  });

  it("selects cells of a table by where it starts", () => {
    const state = cursorAt(grid(), "outro");
    const tr = transactionOf(
      selectIn(1, { top: 0, bottom: 1, left: 0, right: 3 }),
      state,
    )!;

    expect(selectedText(state.apply(tr))).toEqual(["a", "b", "c"]);
    expect(selectIn(1, { top: 2, bottom: 4, left: 0, right: 1 })(state)).toBe(
      false,
    );
    expect(selectIn(1, { top: 1, bottom: 1, left: 0, right: 1 })(state)).toBe(
      false,
    );
  });

  it("runs commands one after the other in one transaction", () => {
    const state = cursorAt(grid(), "outro");
    const select = selectIn(1, { top: 2, bottom: 3, left: 0, right: 1 });
    const tr = transactionOf(sequence([select, addRows("below")]), state)!;
    const after = state.apply(tr);

    expect(after.doc.firstChild!.childCount).toBe(4);
    // the selection the last command left
    expect(selectedText(after)).toEqual([""]);
    // all of them have to apply
    expect(sequence([deleteTable, deleteTable])(state)).toBe(false);
    const nowhere = selectIn(1, { top: 5, bottom: 6, left: 0, right: 1 });
    expect(sequence([select, nowhere])(state)).toBe(false);
  });

  it("repeats a command as often as it applies", () => {
    const state = cursorAt(grid(), "g");
    const tr = transactionOf(repeated(addRows("below"), 3), state)!;

    expect(state.apply(tr).doc.firstChild!.childCount).toBe(6);
    expect(repeated(deleteTable, 2)(state)).toBe(true);
    expect(repeated(addRows("below"), 0)(state)).toBe(false);
  });

  it("returns the transaction a command would dispatch", () => {
    expect(transactionOf(deleteTable, cursorAt(grid(), "g"))).toBeDefined();
    expect(
      transactionOf(deleteTable, cursorAt(grid(), "outro")),
    ).toBeUndefined();
  });
});
