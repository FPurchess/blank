import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { CellSelection } from "prosemirror-tables";
import { EditorView } from "prosemirror-view";

import { columnPercents } from "../../../markdown/tables";
import {
  announcement,
  contextMenu,
  tableHandles as handles,
} from "../../../state";
import { createState, doc, p, table, td, th, tr } from "../../../test/editor";
import { cellTexts, selectedText } from "../../../test/tables";
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
// jsdom lays nothing out, so every box is at 0, 0 and the mouse there is
// over the table
const hover = (x = 0, y = 0) =>
  window.dispatchEvent(new MouseEvent("mousemove", { clientX: x, clientY: y }));

describe("tableHandles", () => {
  beforeEach(() => {
    announcement.value = null;
    contextMenu.value = null;
    view = new EditorView(document.createElement("div"), {
      state: createState(grid(), {
        cursor: 2,
        // the tools tell when a table changes how it is saved
        plugins: [tableView(), tableTools(), tableHandles()],
      }),
    });
  });

  afterEach(() => {
    view.destroy();
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

    hover(500, 500);
    expect(handles.value).toBeNull();
  });

  it("measures the table again only when the mouse gets to another one", () => {
    hover();
    const first = handles.value;
    hover(1, 1);
    expect(handles.value).toBe(first);

    // a change to the document measures it again
    first!.insertRow(1);
    expect(handles.value).not.toBe(first);
  });

  it("inserts rows and columns, and announces it", () => {
    hover();
    state().insertRow(1);
    expect(cellTexts(view.state.doc)).toHaveLength(5);
    expect(announcement.value).toBe("A row added");

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
    expect(announcement.value).toBe("Moved up");

    state().moveColumns([0, 1], 1);
    expect(cellTexts(view.state.doc)[0]).toEqual(["Qty", "Fruit"]);
    expect(announcement.value).toBe("Moved right");
  });

  it("resizes the table", () => {
    hover();
    state().resize(3, 5);
    expect(cellTexts(view.state.doc)).toHaveLength(5);
    expect(announcement.value).toBe("Table resized to 3 × 5");
  });

  it("sets and resets the column widths, with the cursor in the table", () => {
    hover();
    state().setWidths([25, 75]);
    const tableNode = () => view.state.doc.child(1);

    expect(columnPercents(tableNode())).toEqual([25, 75]);
    expect(state().percents).toEqual([25, 75]);
    // the cursor went into the table, so the change of format is told
    expect(state().selected).not.toBeNull();
    expect(announcement.value).toBe(
      "Column widths set. This table has column widths you set, so it's saved as an HTML table.",
    );

    state().setWidths(null);
    expect(columnPercents(tableNode())).toBeNull();
    expect(announcement.value).toBe(
      "Column widths reset. This table is saved as a markdown table again.",
    );
  });

  it("keeps the handles while a drag holds them, wherever the mouse goes", () => {
    hover();
    state().hold(true);
    hover(500, 500);
    expect(handles.value).not.toBeNull();

    state().hold(false);
    expect(handles.value).toBeNull();
  });

  it("hides the handles while typing, until the mouse moves", () => {
    hover();
    view.someProp("handleKeyDown", (f) =>
      f(view, new KeyboardEvent("keydown", { key: "a" })),
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
