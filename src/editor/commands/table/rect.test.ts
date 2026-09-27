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
  selectCells,
  setCellType,
  transactionOf,
} from "./rect";
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

  it("returns the transaction a command would dispatch", () => {
    expect(transactionOf(deleteTable, cursorAt(grid(), "g"))).toBeDefined();
    expect(
      transactionOf(deleteTable, cursorAt(grid(), "outro")),
    ).toBeUndefined();
  });
});
