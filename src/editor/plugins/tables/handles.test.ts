import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Plugin } from "prosemirror-state";
import { CellSelection } from "prosemirror-tables";
import { EditorView } from "prosemirror-view";

import { columnPercents } from "../../../markdown/tables";
import {
  announcement,
  contextMenu,
  tableHandles as handles,
} from "../../../state";
import { tableGeometry } from "../../../engine/geometry";
import { createState, doc, p, table, td, th, tr } from "../../../test/editor";
import { hidePages, showPages } from "../../../test/engine";
import { cellTexts, selectedText } from "../../../test/tables";
import { pageSync } from "../pageView";
import { tableHandles } from "./handles";
import { tableTools } from "./tools";
import { tableView } from "./view";

const grid = () =>
  doc(
    p("intro"),
    table(
      tr(th("Fruit"), th("Qty")),
      tr(td("kiwi"), td("10")),
      tr(td("pear"), td()),
      tr(td(), td()),
    ),
    p("outro"),
  );

let view: EditorView;
const anchor = { left: 0, top: 0, bottom: 0 };
const state = () => handles.value!;
// the table after "intro", as the page view shows it
const TABLE = 7;
const middle = () => {
  const { box } = tableGeometry(TABLE)!.pieces[0];
  return { x: (box.left + box.right) / 2, y: (box.top + box.bottom) / 2 };
};
// the mouse over the table, or at a point
const hover = (x = middle().x, y = middle().y) =>
  window.dispatchEvent(new MouseEvent("mousemove", { clientX: x, clientY: y }));
// far from any table
const AWAY = 5000;

const editor = (node = grid(), plugins: Plugin[] = []) =>
  new EditorView(document.createElement("div"), {
    state: createState(node, {
      cursor: 2,
      // the engine lays out first; the tools tell when a table changes how
      // it is saved
      plugins: [
        pageSync(),
        ...plugins,
        tableView(),
        tableTools(),
        tableHandles(),
      ],
    }),
  });

describe("tableHandles", () => {
  beforeEach(() => {
    announcement.value = null;
    contextMenu.value = null;
    showPages();
    view = editor();
  });

  afterEach(() => {
    view.destroy();
    hidePages();
  });

  it("shows the handles of the table under the mouse, with its layout", () => {
    expect(handles.value).toBeNull();
    hover();

    expect(state()).toMatchObject({
      headerRows: 1,
      headerColumn: false,
      smallest: { cols: 2, rows: 3 },
      selected: null,
    });
    expect(state().rows).toHaveLength(5);
    expect(state().columns).toHaveLength(3);

    hover(AWAY, AWAY);
    expect(handles.value).toBeNull();
  });

  it("measures the rows and columns as the pages show them", () => {
    hover();
    const { box, rows, columns, firstRow, rowCount } = state();
    expect({ firstRow, rowCount }).toEqual({ firstRow: 0, rowCount: 4 });
    expect(rows[0]).toBe(box.top);
    expect(rows[4]).toBe(box.bottom);
    expect(columns[0]).toBe(box.left);
    expect(columns[2]).toBe(box.right);
    for (let row = 1; row < rows.length; row++) {
      expect(rows[row]).toBeGreaterThan(rows[row - 1]);
    }
    // columns sized by content: the first is wider than the second
    expect(state().percents[0]).toBeGreaterThan(state().percents[1]);
  });

  it("shows the rows of the page under the mouse of a longer table", () => {
    view.destroy();
    const rows = Array.from({ length: 80 }, (_, row) =>
      tr(td(`r${row}`), td()),
    );
    view = editor(doc(p("intro"), table(tr(th("a"), th("b")), ...rows), p()));
    const { pieces, rowCount } = tableGeometry(TABLE)!;
    expect(rowCount).toBe(81);
    expect(pieces.length).toBeGreaterThan(1);
    const second = pieces[1];
    hover(second.box.left + 5, second.box.top + 5);

    expect(state().firstRow).toBe(second.firstRow);
    expect(state().firstRow).toBeGreaterThan(0);
    expect(state().rows).toEqual(second.rows);
  });

  it("measures the table again only when the mouse gets to another one", () => {
    hover();
    const first = handles.value;
    hover(middle().x + 1, middle().y + 1);
    expect(handles.value).toBe(first);

    // a change to the document measures it again
    first!.insertRow(1);
    expect(handles.value).not.toBe(first);
  });

  it("inserts rows and columns, and announces it", () => {
    hover();
    state().insertRow(1);
    expect(cellTexts(view.state.doc)).toHaveLength(5);
    expect(announcement.value?.text).toBe("A row added");

    state().insertColumn(2);
    expect(cellTexts(view.state.doc)[0]).toEqual(["Fruit", "Qty", ""]);
  });

  it("selects rows and columns and opens the table menu", () => {
    hover();
    state().selectRows([1, 3], anchor);

    expect(view.state.selection).toBeInstanceOf(CellSelection);
    expect(selectedText(view.state)).toEqual(["kiwi", "10", "pear", ""]);
    expect(contextMenu.value?.items.length).toBeGreaterThan(5);
    expect(state().selected).toEqual({ rows: [1, 3], columns: [0, 2] });

    state().selectColumns([1, 2], anchor);
    expect(selectedText(view.state)).toEqual(["Qty", "10", "", ""]);
  });

  it("moves rows and columns", () => {
    hover();
    state().moveRows([2, 3], -1);
    expect(cellTexts(view.state.doc).map((row) => row[0])).toEqual([
      "Fruit",
      "pear",
      "kiwi",
      "",
    ]);
    expect(announcement.value?.text).toBe("Moved up");

    state().moveColumns([0, 1], 1);
    expect(cellTexts(view.state.doc)[0]).toEqual(["Qty", "Fruit"]);
    expect(announcement.value?.text).toBe("Moved right");
  });

  it("resizes the table", () => {
    hover();
    state().resize(3, 5);
    expect(cellTexts(view.state.doc)).toHaveLength(5);
    expect(announcement.value?.text).toBe("Table resized to 3 × 5");
  });

  it("sets and resets the column widths, with the cursor in the table", () => {
    hover();
    state().setWidths([25, 75]);
    const tableNode = () => view.state.doc.child(1);

    expect(columnPercents(tableNode())).toEqual([25, 75]);
    expect(state().percents).toEqual([25, 75]);
    // the cursor went into the table, so the change of format is told
    expect(state().selected).not.toBeNull();
    expect(announcement.value?.text).toBe(
      "Column widths set. This table has column widths you set, so it's saved as an HTML table.",
    );

    state().setWidths(null);
    expect(columnPercents(tableNode())).toBeNull();
    expect(announcement.value?.text).toBe(
      "Column widths reset. This table is saved as a markdown table again.",
    );
  });

  it("keeps the handles while a drag holds them, wherever the mouse goes", () => {
    hover();
    state().hold(true);
    hover(AWAY, AWAY);
    expect(handles.value).not.toBeNull();

    state().hold(false);
    expect(handles.value).toBeNull();
  });

  it("hides the handles while typing, until the mouse moves", () => {
    // the keys a plugin before them handles, like Tab in a table, too
    view.destroy();
    const keys = new Plugin({ props: { handleKeyDown: () => true } });
    view = editor(grid(), [keys]);
    hover();
    view.dom.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Tab", bubbles: true }),
    );
    expect(handles.value).toBeNull();

    hover();
    expect(handles.value).not.toBeNull();
  });

  it("hides the handles when the mouse leaves the window or the editor goes", () => {
    hover();
    document.documentElement.dispatchEvent(new MouseEvent("mouseleave"));
    expect(handles.value).toBeNull();

    hover();
    view.destroy();
    expect(handles.value).toBeNull();
    view = new EditorView(document.createElement("div"), {
      state: createState(grid()),
    });
  });
});
