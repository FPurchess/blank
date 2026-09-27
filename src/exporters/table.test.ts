import { describe, expect, it } from "vitest";

import { schema } from "../markdown";
import { p, table, td, th, tr } from "../test/editor";
import { cellShare, hasTallRows, tableGrid } from "./table";

describe("tableGrid", () => {
  it("places every cell and marks the positions merged cells cover", () => {
    const grid = tableGrid(
      table(
        tr(th("a", { colspan: 2 }), th("b")),
        tr(td("c", { rowspan: 2 }), td("d"), td("e")),
        tr(td("f"), td("g")),
      ),
    );

    expect(
      grid.rows.map((row) =>
        row.map((cell) => (cell ? cell.node.textContent : null)),
      ),
    ).toEqual([
      ["a", null, "b"],
      ["c", "d", "e"],
      [null, "f", "g"],
    ]);
    expect(grid.rows[0][0]).toMatchObject({ colspan: 2, header: true });
    expect(grid.rows[1][0]).toMatchObject({ row: 1, col: 0, rowspan: 2 });
  });

  it("counts the leading rows of header cells", () => {
    const grid = tableGrid(
      table(tr(th("a")), tr(th("b")), tr(td("c")), tr(th("d"))),
    );

    expect(grid.headerRows).toBe(2);
  });

  it("doesn't repeat a table of header cells only", () => {
    expect(tableGrid(table(tr(th("a")), tr(th("b")))).headerRows).toBe(0);
  });

  it("sizes the columns by their longest line", () => {
    const grid = tableGrid(
      table(
        tr(th("Name"), th("Description")),
        tr(td("ab"), td("x".repeat(100))),
      ),
    );

    // at least three characters, and at most forty count
    expect(grid.widths).toEqual([4 / 44, 40 / 44]);
    expect(grid.widths.reduce((a, b) => a + b)).toBeCloseTo(1);
  });

  it("leaves merged cells out of the column widths", () => {
    const grid = tableGrid(
      table(
        tr(th("a long heading over both", { colspan: 2 })),
        tr(td("x"), td("y")),
      ),
    );

    expect(grid.widths).toEqual([0.5, 0.5]);
  });

  it("measures the lines of a cell separately", () => {
    const cell = td([
      schema.nodes.paragraph.create(null, [
        schema.text("short"),
        schema.nodes.hard_break.create(),
        schema.text("longer line"),
      ]),
      p("mid"),
    ]);

    expect(tableGrid(table(tr(th("a")), tr(cell))).widths).toEqual([1]);
    expect(
      tableGrid(table(tr(th("a"), th("b")), tr(cell, td("abc")))).widths,
    ).toEqual([11 / 14, 3 / 14]);
  });
});

describe("cellShare", () => {
  it("adds up the columns a cell spans", () => {
    const grid = tableGrid(
      table(
        tr(th("aaaa", { colspan: 2 }), th("bb")),
        tr(td("aaaa"), td("aaaa"), td("bb")),
      ),
    );

    expect(cellShare(grid, grid.rows[0][0]!)).toBeCloseTo(8 / 11);
    expect(cellShare(grid, grid.rows[1][2]!)).toBeCloseTo(3 / 11);
  });
});

describe("hasTallRows", () => {
  it("is false for short cells", () => {
    expect(hasTallRows(table(tr(th("a")), tr(td("b"))))).toBe(false);
  });

  it("is true for a cell with a lot of text or an image", () => {
    const image = schema.nodes.image.create({ src: "a.png" });

    expect(hasTallRows(table(tr(th("a")), tr(td("x".repeat(601)))))).toBe(true);
    expect(
      hasTallRows(
        table(tr(th("a")), tr(td(schema.nodes.paragraph.create(null, image)))),
      ),
    ).toBe(true);
  });
});
