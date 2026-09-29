import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { tableHandles, type TableHandlesState } from "./state";
import {
  bootTableHandles,
  dropAt,
  hoverAt,
  movedBy,
  resized,
  sizeAt,
} from "./tableHandles";

// a table of three rows (the first a header row) and three columns, 300px
// wide, at 100, 100
const fake = (change: Partial<TableHandlesState> = {}): TableHandlesState => ({
  box: { left: 100, top: 100, right: 400, bottom: 220 },
  visible: { left: 100, right: 400 },
  rows: [100, 140, 180, 220],
  firstRow: 0,
  rowCount: 3,
  columns: [100, 200, 300, 400],
  headerRows: 1,
  headerColumn: false,
  smallest: { cols: 2, rows: 2 },
  percents: [30, 30, 40],
  selected: null,
  insertRow: vi.fn(),
  insertColumn: vi.fn(),
  selectRows: vi.fn(),
  selectColumns: vi.fn(),
  moveRows: vi.fn(),
  moveColumns: vi.fn(),
  resize: vi.fn(),
  setWidths: vi.fn(),
  hold: vi.fn(),
  ...change,
});

describe("hoverAt", () => {
  it("finds the row and column under the mouse", () => {
    expect(hoverAt(fake(), { x: 250, y: 150 })).toEqual({
      row: 1,
      column: 1,
      insertRow: null,
      insertColumn: null,
    });
    // just outside the table, where the handles are
    expect(hoverAt(fake(), { x: 90, y: 150 })).toMatchObject({
      row: 1,
      column: 0,
    });
  });

  it("offers to insert where the mouse is near a line on the edge", () => {
    expect(hoverAt(fake(), { x: 102, y: 178 }).insertRow).toBe(2);
    expect(hoverAt(fake(), { x: 297, y: 104 }).insertColumn).toBe(2);
    // away from the edge, inside the table
    expect(hoverAt(fake(), { x: 250, y: 178 }).insertRow).toBeNull();
  });

  it("doesn't offer to insert before the header row or header column", () => {
    expect(hoverAt(fake(), { x: 102, y: 102 }).insertRow).toBeNull();
    expect(hoverAt(fake({ headerRows: 0 }), { x: 102, y: 102 }).insertRow).toBe(
      0,
    );
    expect(hoverAt(fake(), { x: 103, y: 104 }).insertColumn).toBe(0);
    expect(
      hoverAt(fake({ headerColumn: true }), { x: 103, y: 110 }).insertColumn,
    ).toBeNull();
  });
});

describe("dropping rows and columns", () => {
  it("drops at the nearest line outside the dragged rows, after the header", () => {
    const lines = [100, 140, 180, 220, 260];
    expect(dropAt(lines, [3, 4], 150, 1)).toBe(1);
    expect(dropAt(lines, [3, 4], 90, 1)).toBe(1);
    expect(dropAt(lines, [1, 3], 170, 1)).toBe(1);
    expect(dropAt(lines, [1, 2], 250, 1)).toBe(4);
  });

  it("tells how far the drop moves them", () => {
    expect(movedBy([3, 4], 1)).toBe(-2);
    expect(movedBy([1, 2], 4)).toBe(2);
    expect(movedBy([1, 3], 3)).toBe(0);
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
    expect(sizeAt(fake(), 130, 85)).toEqual({ cols: 5, rows: 5 });
    expect(sizeAt(fake(), 20, 10)).toEqual({ cols: 3, rows: 3 });
  });

  it("drops each column or row whose middle the edge passes", () => {
    const table = fake({ smallest: { cols: 1, rows: 1 } });
    expect(sizeAt(table, -40, -10)).toEqual({ cols: 3, rows: 3 });
    expect(sizeAt(table, -60, -30)).toEqual({ cols: 2, rows: 2 });
    expect(sizeAt(table, -160, -300)).toEqual({ cols: 1, rows: 1 });
  });

  it("shrinks down to the smallest size the table allows", () => {
    expect(sizeAt(fake(), -300, -200)).toEqual({ cols: 2, rows: 2 });
  });
});

describe("a table on several pages", () => {
  // rows 2 and 3 of 5, on the page under the mouse
  const piece = () =>
    fake({
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

describe("bootTableHandles", () => {
  const root = () => document.getElementById("table-handles")!;
  const get = (selector: string) =>
    root().querySelector<HTMLElement>(selector)!;
  const mouse = (x: number, y: number) =>
    window.dispatchEvent(
      new MouseEvent("mousemove", { clientX: x, clientY: y }),
    );
  const pointer = (target: HTMLElement, type: string, x: number, y: number) =>
    target.dispatchEvent(
      new MouseEvent(type, {
        bubbles: true,
        clientX: x,
        clientY: y,
        button: 0,
      }),
    );
  const drag = (
    target: HTMLElement,
    from: [number, number],
    to: [number, number],
  ) => {
    pointer(target, "pointerdown", ...from);
    pointer(target, "pointermove", ...to);
    pointer(target, "pointerup", 0, 0);
  };

  let dispose: () => void;

  beforeEach(() => {
    dispose = bootTableHandles();
  });

  afterEach(() => {
    dispose();
    tableHandles.value = null;
  });

  it("shows the handles of the row and column under the mouse", () => {
    tableHandles.value = fake();
    expect(root().hidden).toBe(false);
    mouse(250, 150);

    expect(get(".grip.row").hidden).toBe(false);
    expect(get(".grip.row").style.top).toBe("146px");
    expect(get(".grip.column").style.left).toBe("206px");
    expect(get(".insert").hidden).toBe(true);
    expect(root().querySelectorAll(".resizer")).toHaveLength(2);

    tableHandles.value = null;
    expect(root().hidden).toBe(true);
  });

  it("keeps the row handles in view on a table scrolled sideways", () => {
    tableHandles.value = fake({
      box: { left: 20, top: 100, right: 400, bottom: 220 },
      visible: { left: 100, right: 400 },
      columns: [20, 200, 300, 400],
    });
    mouse(150, 150);
    expect(get(".grip.row").style.left).toBe("94px");

    mouse(101, 179);
    expect(get(".insert").style.left).toBe("91px");
  });

  it("inserts a row with the + on the line between rows", () => {
    const table = fake();
    tableHandles.value = table;
    mouse(101, 179);
    expect(get(".insert").hidden).toBe(false);
    expect(get(".grip.row").hidden).toBe(true);

    pointer(get(".insert"), "pointerdown", 101, 179);
    expect(table.insertRow).toHaveBeenCalledWith(2);
  });

  it("inserts a column with the + on the line between columns", () => {
    const table = fake();
    tableHandles.value = table;
    mouse(301, 101);

    pointer(get(".insert"), "pointerdown", 301, 101);
    expect(table.insertColumn).toHaveBeenCalledWith(2);
  });

  it("selects a row and opens the table menu on a click on its handle", () => {
    const table = fake();
    tableHandles.value = table;
    mouse(100, 150);
    pointer(get(".grip.row"), "pointerdown", 100, 150);
    pointer(get(".grip.row"), "pointerup", 100, 150);

    expect(table.hold).toHaveBeenCalledWith(true);
    expect(table.selectRows).toHaveBeenCalledWith([1, 2], expect.any(Object));
    expect(table.hold).toHaveBeenLastCalledWith(false);
  });

  it("moves the selected rows by dragging a handle among them", () => {
    const table = fake({
      rows: [100, 140, 180, 220, 260],
      box: { left: 100, top: 100, right: 400, bottom: 260 },
      selected: { rows: [2, 4], columns: [0, 3] },
    });
    tableHandles.value = table;
    mouse(100, 190);
    drag(get(".grip.row"), [100, 190], [100, 142]);

    expect(table.moveRows).toHaveBeenCalledWith([2, 4], -1);
  });

  it("moves a column by dragging its handle", () => {
    const table = fake();
    tableHandles.value = table;
    mouse(150, 100);
    drag(get(".grip.column"), [150, 100], [395, 100]);

    expect(table.moveColumns).toHaveBeenCalledWith([0, 1], 2);
  });

  it("resizes columns by dragging the line between them", () => {
    const table = fake();
    tableHandles.value = table;
    mouse(200, 150);
    drag(get('.resizer[data-index="1"]'), [200, 150], [230, 150]);

    expect(table.setWidths).toHaveBeenCalledWith([40, 20, 40]);
  });

  it("sizes columns by content again on a double click on a line", () => {
    const table = fake();
    tableHandles.value = table;
    const line = get(".resizer");
    for (let i = 0; i < 2; i++) {
      pointer(line, "pointerdown", 200, 150);
      pointer(line, "pointerup", 200, 150);
    }

    expect(table.setWidths).toHaveBeenCalledOnce();
    expect(table.setWidths).toHaveBeenCalledWith(null);
  });

  it("adds rows and columns by dragging the corner, showing the new size", () => {
    const table = fake();
    tableHandles.value = table;
    const corner = get(".edge.corner");
    pointer(corner, "pointerdown", 400, 220);
    pointer(corner, "pointermove", 460, 260);
    expect(get(".ghost").hidden).toBe(false);
    expect(get(".size").textContent).toBe("4 × 4");
    pointer(corner, "pointerup", 0, 0);

    expect(table.resize).toHaveBeenCalledWith(4, 4);
    expect(get(".ghost").hidden).toBe(true);
  });

  it("drags the right edge sideways only and the bottom edge down only", () => {
    const table = fake();
    tableHandles.value = table;
    drag(get(".edge.right"), [400, 150], [460, 300]);
    expect(table.resize).toHaveBeenLastCalledWith(4, 3);

    drag(get(".edge.bottom"), [250, 220], [400, 300]);
    expect(table.resize).toHaveBeenLastCalledWith(3, 5);
  });

  it("cancels a drag with Esc", () => {
    const table = fake();
    tableHandles.value = table;
    const corner = get(".edge.corner");
    pointer(corner, "pointerdown", 400, 220);
    pointer(corner, "pointermove", 500, 260);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    pointer(corner, "pointerup", 0, 0);

    expect(table.resize).not.toHaveBeenCalled();
    expect(table.hold).toHaveBeenLastCalledWith(false);
  });

  it("goes away once disposed", () => {
    dispose();
    expect(document.getElementById("table-handles")).toBeNull();

    // renders no more, and a second dispose does no harm
    tableHandles.value = fake();
    mouse(250, 150);
    expect(document.getElementById("table-handles")).toBeNull();
    dispose = () => {};
  });

  it("keeps the focus in the editor when a handle is pressed", () => {
    tableHandles.value = fake();
    const down = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    });
    get(".edge.corner").dispatchEvent(down);

    expect(down.defaultPrevented).toBe(true);
  });
});
