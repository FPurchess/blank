import { describe, expect, it } from "vitest";
import type { EditorState } from "prosemirror-state";
import { CellSelection, tableEditing } from "prosemirror-tables";

import { createState, doc, p, table, td, th, tr } from "../../../test/editor";
import { tableGuard } from "../../plugins/tables/guard";
import {
  cellTexts,
  cellTypes,
  cursorAt,
  selectedText,
} from "../../../test/tables";
import {
  insertColumnAt,
  insertRowAt,
  moveColumnsBy,
  moveRowsBy,
  resizeTable,
  selectColumns,
  selectRows,
  smallestSize,
} from "./grid";
import { transactionOf } from "./rect";

const grid = () =>
  doc(
    p("intro"),
    table(
      tr(th("Fruit"), th("Qty"), th("Note")),
      tr(td("kiwi"), td("10"), td()),
      tr(td("pear"), td("2"), td()),
      tr(td("plum"), td("7"), td()),
    ),
    p("outro"),
  );

// the table starts inside its node, after the intro paragraph
const START = p("intro").nodeSize + 1;

const run = (
  command: ReturnType<typeof insertRowAt>,
  state: EditorState = cursorAt(grid(), "outro"),
) => {
  const tr = transactionOf(command, state);
  return tr && state.apply(tr);
};

describe("table commands for the mouse", () => {
  it("selects rows and columns of a table the cursor isn't in", () => {
    const rows = run(selectRows(START, 1, 3))!;
    expect(rows.selection).toBeInstanceOf(CellSelection);
    expect(selectedText(rows)).toEqual(["kiwi", "10", "", "pear", "2", ""]);

    const columns = run(selectColumns(START, 1, 2))!;
    expect(selectedText(columns)).toEqual(["Qty", "10", "2", "7"]);

    expect(run(selectRows(START, 3, 5))).toBeUndefined();
    expect(run(selectRows(START + 1, 0, 1))).toBeUndefined();
  });

  it("inserts a row or a column at an index", () => {
    const row = run(insertRowAt(START, 2))!;
    expect(cellTexts(row.doc).map((r) => r[0])).toEqual([
      "Fruit",
      "kiwi",
      "",
      "pear",
      "plum",
    ]);

    const column = run(insertColumnAt(START, 0))!;
    expect(cellTexts(column.doc)[0]).toEqual(["", "Fruit", "Qty", "Note"]);
    expect(cellTypes(column.doc)[0]).toEqual(["th", "th", "th", "th"]);
  });

  it("doesn't insert a row above the header row", () => {
    expect(run(insertRowAt(START, 0))).toBeUndefined();
  });

  it("moves rows and columns by several steps in one undo step", () => {
    const rows = run(moveRowsBy(START, 1, 2, 2))!;
    expect(cellTexts(rows.doc).map((r) => r[0])).toEqual([
      "Fruit",
      "pear",
      "plum",
      "kiwi",
    ]);
    // the moved row stays selected
    expect(selectedText(rows)).toEqual(["kiwi", "10", ""]);

    const columns = run(moveColumnsBy(START, 2, 3, -2))!;
    expect(cellTexts(columns.doc)[0]).toEqual(["Note", "Fruit", "Qty"]);
  });

  it("moves rows as far as they can go", () => {
    // rows stay below the header row
    const rows = run(moveRowsBy(START, 2, 3, -5))!;
    expect(cellTexts(rows.doc).map((r) => r[0])).toEqual([
      "Fruit",
      "pear",
      "kiwi",
      "plum",
    ]);
    expect(run(moveRowsBy(START, 1, 2, -1))).toBeUndefined();
  });

  it("grows a table at its end", () => {
    const grown = run(resizeTable(START, 4, 6))!;
    const texts = cellTexts(grown.doc);
    expect(texts).toHaveLength(6);
    expect(texts.every((row) => row.length === 4)).toBe(true);
    expect(cellTypes(grown.doc)[0][3]).toBe("th");
  });

  it("grows a table of a header row only with body rows", () => {
    const node = doc(p("intro"), table(tr(th("Fruit"), th("Qty"))), p());
    const grown = run(resizeTable(START, 2, 3), cursorAt(node, "intro"))!;

    expect(cellTypes(grown.doc)).toEqual([
      ["th", "th"],
      ["td", "td"],
      ["td", "td"],
    ]);
  });

  it("grows a table with the plugins that fix tables as it changes", () => {
    const state = createState(grid(), {
      cursor: 1,
      plugins: [tableEditing(), tableGuard()],
    });
    const grown = run(resizeTable(START, 4, 6), state)!;

    expect(cellTexts(grown.doc)).toHaveLength(6);
    expect(cellTexts(grown.doc)[5]).toHaveLength(4);
  });

  it("shrinks a table only as far as its end is empty", () => {
    const node = doc(
      p("intro"),
      table(
        tr(th("Fruit"), th("Qty"), th()),
        tr(td("kiwi"), td("10"), td()),
        tr(td(), td(), td()),
      ),
      p("outro"),
    );
    expect(smallestSize(node.child(1))).toEqual({ cols: 2, rows: 2 });

    const shrunk = run(resizeTable(START, 1, 1), cursorAt(node, "outro"))!;
    expect(cellTexts(shrunk.doc)).toEqual([
      ["Fruit", "Qty"],
      ["kiwi", "10"],
    ]);
    expect(run(resizeTable(START, 2, 2), shrunk)).toBeUndefined();
    // a column with a header isn't empty
    expect(smallestSize(grid().child(1))).toEqual({ cols: 3, rows: 4 });
  });
});
