import { describe, expect, it } from "vitest";

import { fakeTableHandles } from "../test/tables";
import {
  anchorOf,
  type Drag,
  type Hover,
  handlesOf,
  hidesHandles,
  hoverAt,
  NO_HOVER,
  previewOf,
  resized,
  sameHover,
  sizeAt,
  spanOf,
  styleOf,
} from "./tableHandlesModel";
import { dropAt } from "./dragModel";

const start = { x: 0, y: 0 };

describe("hidesHandles", () => {
  it("hides them once rows or columns move, not for a click or other drags", () => {
    const move: Drag = {
      kind: "move",
      axis: "rows",
      span: [1, 2],
      start,
      at: start,
      moving: false,
    };
    expect(hidesHandles(null)).toBe(false);
    expect(hidesHandles(move)).toBe(false);
    expect(hidesHandles({ ...move, moving: true })).toBe(true);
    expect(hidesHandles({ kind: "resize", index: 1, start, at: start })).toBe(
      false,
    );
    expect(
      hidesHandles({
        kind: "edge",
        horizontal: true,
        vertical: true,
        start,
        at: start,
      }),
    ).toBe(false);
  });
});

describe("anchorOf and styleOf", () => {
  it("turn a box into a menu's anchor and an inline style", () => {
    const box = { left: 10, top: 20, width: 30, height: 40 };
    expect(anchorOf(box)).toEqual({ left: 10, top: 20, bottom: 60 });
    expect(styleOf(box)).toEqual({
      left: "10px",
      top: "20px",
      width: "30px",
      height: "40px",
    });
    expect(styleOf(null)).toBeUndefined();
  });
});

describe("previewOf", () => {
  const table = fakeTableHandles();

  it("shows the new size while an edge is dragged", () => {
    const preview = previewOf(
      {
        kind: "edge",
        horizontal: true,
        vertical: true,
        start: { x: 400, y: 220 },
        at: { x: 460, y: 260 },
      },
      table,
    );
    expect(preview.size).toBe("4 × 4");
    expect(preview.ghost).toEqual({
      left: 100,
      top: 100,
      width: 360,
      height: 160,
    });
    expect(preview.guide).toBeNull();
  });

  it("shows where a resized line goes, and nothing else", () => {
    const preview = previewOf(
      {
        kind: "resize",
        index: 1,
        start: { x: 200, y: 0 },
        at: { x: 230, y: 0 },
      },
      table,
    );
    expect(preview.guide).toEqual({
      left: 219,
      top: 100,
      width: 2,
      height: 120,
    });
    expect(preview).toMatchObject({ ghost: null, dragged: null, size: "" });
  });
});

describe("sameHover", () => {
  it("tells hovers apart by what the mouse is over", () => {
    expect(sameHover(NO_HOVER, { ...NO_HOVER })).toBe(true);
    expect(sameHover(NO_HOVER, { ...NO_HOVER, row: 1 })).toBe(false);
    expect(sameHover(NO_HOVER, { ...NO_HOVER, insertColumn: 0 })).toBe(false);
  });
});

describe("hoverAt", () => {
  it("finds the row and column under the mouse", () => {
    expect(hoverAt(fakeTableHandles(), { x: 250, y: 150 })).toEqual({
      row: 1,
      column: 1,
      insertRow: null,
      insertColumn: null,
    });
    // just outside the table, where the handles are
    expect(hoverAt(fakeTableHandles(), { x: 90, y: 150 })).toMatchObject({
      row: 1,
      column: 0,
    });
  });

  it("offers to insert where the mouse is near a line on the edge", () => {
    expect(hoverAt(fakeTableHandles(), { x: 102, y: 178 }).insertRow).toBe(2);
    expect(hoverAt(fakeTableHandles(), { x: 297, y: 104 }).insertColumn).toBe(
      2,
    );
    // away from the edge, inside the table
    expect(
      hoverAt(fakeTableHandles(), { x: 250, y: 178 }).insertRow,
    ).toBeNull();
  });

  it("doesn't offer to insert before the header row or header column", () => {
    expect(
      hoverAt(fakeTableHandles(), { x: 102, y: 102 }).insertRow,
    ).toBeNull();
    expect(
      hoverAt(fakeTableHandles({ headerRows: 0 }), { x: 102, y: 102 })
        .insertRow,
    ).toBe(0);
    expect(hoverAt(fakeTableHandles(), { x: 103, y: 104 }).insertColumn).toBe(
      0,
    );
    expect(
      hoverAt(fakeTableHandles({ headerColumn: true }), { x: 103, y: 110 })
        .insertColumn,
    ).toBeNull();
  });
});

describe("resized", () => {
  it("shares the width of the columns on both sides of the line anew", () => {
    expect(resized([30, 30, 40], 1, 30, 300)).toEqual([40, 20, 40]);
  });

  it("keeps each column at least 32px wide", () => {
    expect(resized([30, 30, 40], 1, 500, 300)).toEqual([49.3, 10.7, 40]);
    expect(resized([30, 30, 40], 2, -500, 300)).toEqual([30, 10.7, 59.3]);
  });
});

describe("sizeAt", () => {
  it("adds a column per 60px and a row per average height dragged", () => {
    expect(sizeAt(fakeTableHandles(), 130, 85)).toEqual({ cols: 5, rows: 5 });
    expect(sizeAt(fakeTableHandles(), 20, 10)).toEqual({ cols: 3, rows: 3 });
  });

  it("drops each column or row whose middle the edge passes", () => {
    const table = fakeTableHandles({ smallest: { cols: 1, rows: 1 } });
    expect(sizeAt(table, -40, -10)).toEqual({ cols: 3, rows: 3 });
    expect(sizeAt(table, -60, -30)).toEqual({ cols: 2, rows: 2 });
    expect(sizeAt(table, -160, -300)).toEqual({ cols: 1, rows: 1 });
  });

  it("shrinks down to the smallest size the table allows", () => {
    expect(sizeAt(fakeTableHandles(), -300, -200)).toEqual({
      cols: 2,
      rows: 2,
    });
  });
});

describe("a table on several pages", () => {
  // rows 2 and 3 of 5, on the page under the mouse
  const piece = () =>
    fakeTableHandles({
      box: { left: 100, top: 100, right: 400, bottom: 180 },
      rows: [100, 140, 180],
      firstRow: 2,
      rowCount: 5,
    });

  it("counts the rows shown from the first of them", () => {
    expect(hoverAt(piece(), { x: 250, y: 150 })).toMatchObject({
      row: 3,
      column: 1,
    });
    expect(hoverAt(piece(), { x: 102, y: 141 }).insertRow).toBe(3);
    // the line above the first row shown inserts before it
    expect(hoverAt(piece(), { x: 102, y: 101 }).insertRow).toBe(2);
  });

  it("moves and grows by the rows of the whole table", () => {
    expect(sizeAt(piece(), 0, 0)).toEqual({ cols: 3, rows: 4 });
    expect(dropAt(piece().rows, [0, 1], 178, 0)).toBe(2);
  });
});

const cell: Hover = { ...NO_HOVER, row: 1, column: 1 };

describe("handlesOf", () => {
  it("places every handle of the cell under the mouse", () => {
    expect(handlesOf(fakeTableHandles(), cell, false)).toEqual({
      rowGrip: { left: 94, top: 146, width: 12, height: 28 },
      columnGrip: { left: 206, top: 94, width: 88, height: 12 },
      rowSelected: false,
      columnSelected: false,
      insert: null,
      insertLine: null,
      resizers: [
        { left: 196, top: 100, width: 8, height: 120 },
        { left: 296, top: 100, width: 8, height: 120 },
      ],
      right: { left: 397, top: 100, width: 9, height: 114 },
      bottom: { left: 100, top: 217, width: 294, height: 9 },
      corner: { left: 395, top: 215, width: 12, height: 12 },
    });
  });

  it("hides all of them while rows or columns are dragged", () => {
    expect(handlesOf(fakeTableHandles(), cell, true)).toMatchObject({
      rowGrip: null,
      columnGrip: null,
      insert: null,
      resizers: [null, null],
      right: null,
      bottom: null,
      corner: null,
    });
  });

  it("shows the + and its line instead of the grips", () => {
    const handles = handlesOf(
      fakeTableHandles(),
      { ...cell, insertRow: 2 },
      false,
    );
    expect(handles.rowGrip).toBeNull();
    expect(handles.columnGrip).toBeNull();
    expect(handles.insert).toEqual({
      left: 91,
      top: 171,
      width: 18,
      height: 18,
    });
    expect(handles.insertLine).toEqual({
      left: 100,
      top: 179,
      width: 300,
      height: 2,
    });
    // a table scrolled sideways keeps the line in view
    const scrolled = fakeTableHandles({
      box: { left: 20, top: 100, right: 400, bottom: 220 },
      columns: [20, 200, 300, 400],
    });
    expect(
      handlesOf(scrolled, { ...NO_HOVER, insertRow: 2 }, false).insertLine,
    ).toMatchObject({ left: 100 });
  });

  it("hides the + of a line between columns scrolled out of view", () => {
    const scrolled = fakeTableHandles({ visible: { left: 150, right: 400 } });
    expect(
      handlesOf(scrolled, { ...NO_HOVER, insertColumn: 0 }, false).insert,
    ).toBeNull();
    expect(
      handlesOf(scrolled, { ...NO_HOVER, insertColumn: 1 }, false).insert,
    ).toEqual({ left: 191, top: 91, width: 18, height: 18 });
  });

  it("leaves out the grip of a column too narrow for it", () => {
    const narrow = fakeTableHandles({ columns: [100, 110, 300, 400] });
    expect(
      handlesOf(narrow, { ...NO_HOVER, row: 1, column: 0 }, false).columnGrip,
    ).toBeNull();
  });

  it("hides the lines and the right edge scrolled out of view", () => {
    const wide = fakeTableHandles({
      box: { left: 100, top: 100, right: 500, bottom: 220 },
      columns: [100, 200, 450, 500],
    });
    const handles = handlesOf(wide, cell, false);
    expect(handles.resizers[0]).not.toBeNull();
    expect(handles.resizers[1]).toBeNull();
    expect(handles.right).toBeNull();
    expect(handles.corner).toBeNull();
    expect(handles.bottom).not.toBeNull();
  });

  it("shows the bottom edge only on the page the table ends on", () => {
    const piece = fakeTableHandles({
      box: { left: 100, top: 100, right: 400, bottom: 180 },
      rows: [100, 140, 180],
      rowCount: 5,
    });
    const handles = handlesOf(piece, cell, false);
    expect(handles.bottom).toBeNull();
    expect(handles.corner).toBeNull();
    expect(handles.right).not.toBeNull();
  });

  it("marks the grip of whole selected rows or columns", () => {
    const rows = fakeTableHandles({
      selected: { rows: [1, 2], columns: [0, 3] },
    });
    expect(handlesOf(rows, cell, false)).toMatchObject({
      rowSelected: true,
      columnSelected: false,
    });
    const columns = fakeTableHandles({
      selected: { rows: [0, 3], columns: [1, 2] },
    });
    expect(handlesOf(columns, cell, false)).toMatchObject({
      rowSelected: false,
      columnSelected: true,
    });
    // cells, not whole rows
    const cells = fakeTableHandles({
      selected: { rows: [1, 2], columns: [1, 3] },
    });
    expect(handlesOf(cells, cell, false).rowSelected).toBe(false);
  });
});

describe("spanOf", () => {
  it("takes the selected rows only for a handle among them", () => {
    const table = fakeTableHandles({
      selected: { rows: [1, 2], columns: [0, 3] },
    });
    expect(spanOf(table, "rows", 1)).toEqual([1, 2]);
    expect(spanOf(table, "rows", 2)).toEqual([2, 3]);
  });
});

describe("previewOf a move", () => {
  it("shows the dragged rows and where they land", () => {
    const drag: Drag = {
      kind: "move",
      axis: "rows",
      span: [1, 2],
      start: { x: 0, y: 150 },
      at: { x: 0, y: 215 },
      moving: true,
    };
    const preview = previewOf(drag, fakeTableHandles());
    expect(preview.guide).toEqual({
      left: 100,
      top: 218,
      width: 300,
      height: 4,
    });
    expect(preview.dragged).toEqual({
      left: 100,
      top: 140,
      width: 300,
      height: 40,
    });
  });

  it("shows the dragged columns within the view and where they land", () => {
    const table = fakeTableHandles({ visible: { left: 150, right: 350 } });
    const drag = (span: [number, number], x: number): Drag => ({
      kind: "move",
      axis: "columns",
      span,
      start,
      at: { x, y: 0 },
      moving: true,
    });
    expect(previewOf(drag([0, 1], 395), table)).toMatchObject({
      guide: { left: 398, top: 100, width: 4, height: 120 },
      dragged: { left: 150, top: 100, width: 50, height: 120 },
    });
    expect(previewOf(drag([2, 3], 105), table).dragged).toEqual({
      left: 300,
      top: 100,
      width: 50,
      height: 120,
    });
  });
});

describe("previewOf an edge", () => {
  it("reads columns × rows", () => {
    const preview = previewOf(
      {
        kind: "edge",
        horizontal: true,
        vertical: false,
        start,
        at: { x: 60, y: 0 },
      },
      fakeTableHandles(),
    );
    expect(preview.size).toBe("4 × 3");
  });

  it("is as tall as the rows shown on a later page", () => {
    const piece = fakeTableHandles({
      box: { left: 100, top: 100, right: 400, bottom: 180 },
      rows: [100, 140, 180],
      firstRow: 2,
      rowCount: 5,
    });
    const preview = previewOf(
      { kind: "edge", horizontal: false, vertical: true, start, at: start },
      piece,
    );
    expect(preview.ghost).toMatchObject({ top: 100, height: 80 });
    expect(preview.size).toBe("3 × 4");
  });
});
