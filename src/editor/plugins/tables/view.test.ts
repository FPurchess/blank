import { describe, expect, it, vi } from "vitest";
import { TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";

import { createState, doc, p, table, td, th, tr } from "../../../test/editor";
import { columnWidths, TableView, tableView } from "./view";

/**
 * rendered returns table rows whose cells report the given widths
 */
const rendered = (widths: number[][]) =>
  widths.map((row) => {
    const tr = document.createElement("tr");
    for (const width of row) {
      const cell = document.createElement("td");
      cell.getBoundingClientRect = () => ({ width }) as DOMRect;
      tr.appendChild(cell);
    }
    return tr;
  });

describe("columnWidths", () => {
  it("measures each column from its cells", () => {
    const node = table(tr(th("a"), th("b")), tr(td("c"), td("d")));

    expect(
      columnWidths(
        node,
        rendered([
          [100, 50],
          [100, 50],
        ]),
      ),
    ).toEqual([100, 50]);
  });

  it("shares merged cells among columns only they cover", () => {
    const node = table(
      tr(th("a", { colspan: 2 }), th("b")),
      tr(td("c", { colspan: 2 }), td("d")),
    );

    expect(
      columnWidths(
        node,
        rendered([
          [200, 60],
          [200, 60],
        ]),
      ),
    ).toEqual([100, 100, 60]);
  });
});

describe("TableView", () => {
  it("renders the caption and hides it without one", () => {
    const view = new TableView(table(tr(th("a"))));
    const caption = view.dom.querySelector("caption")!;
    expect(caption.hidden).toBe(true);

    view.update(
      table(tr(th("a"))).type.create(
        { caption: "Stock" },
        table(tr(th("a"))).content,
      ),
    );
    expect(caption.hidden).toBe(false);
    expect(caption.textContent).toBe("Stock");
  });

  it("freezes and unfreezes the column widths", () => {
    const view = new TableView(table(tr(th("a"), th("b"))));
    const row = rendered([[120, 80]])[0];
    view.contentDOM.appendChild(row);

    view.freeze();
    const table_ = view.dom.querySelector("table")!;
    expect(view.frozen).toBe(true);
    expect(table_.style.tableLayout).toBe("fixed");
    expect(
      [...view.dom.querySelectorAll("col")].map((col) => col.style.width),
    ).toEqual(["120px", "80px"]);

    view.unfreeze();
    expect(view.frozen).toBe(false);
    expect(table_.style.tableLayout).toBe("");
    expect(view.dom.querySelectorAll("col")).toHaveLength(0);
  });

  it("renders the column widths set on the table, which don't freeze", () => {
    const sized = (a: number, b: number) =>
      table(tr(th("a", { colwidth: [a] }), th("b", { colwidth: [b] })));
    const view = new TableView(sized(30, 70));
    view.contentDOM.appendChild(rendered([[120, 80]])[0]);
    const cols = () =>
      [...view.dom.querySelectorAll("col")].map((col) => col.style.width);
    const table_ = view.dom.querySelector("table")!;

    expect(cols()).toEqual(["30%", "70%"]);
    expect(table_.style.width).toBe("100%");
    view.freeze();
    expect(view.frozen).toBe(false);
    expect(cols()).toEqual(["30%", "70%"]);

    view.update(sized(60, 40));
    expect(cols()).toEqual(["60%", "40%"]);

    // reset to automatic widths
    view.update(table(tr(th("a"), th("b"))));
    expect(cols()).toEqual([]);
    expect(table_.style.tableLayout).toBe("");
  });

  it("measures again once columns were added", () => {
    vi.useFakeTimers();
    const view = new TableView(table(tr(th("a"))));
    view.contentDOM.appendChild(rendered([[100]])[0]);
    view.freeze();
    const refreeze = vi.spyOn(view, "refreeze");

    view.update(table(tr(th("a"), th("b"))));
    vi.runAllTimers();
    expect(refreeze).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("ignores changes to its caption and column widths", () => {
    const view = new TableView(table(tr(th("a"))));
    const caption = view.dom.querySelector("caption")!;

    expect(
      view.ignoreMutation({
        type: "childList",
        target: caption,
      } as unknown as MutationRecord),
    ).toBe(true);
    expect(
      view.ignoreMutation({
        type: "childList",
        target: view.contentDOM,
      } as unknown as MutationRecord),
    ).toBe(false);
    expect(view.ignoreMutation({ type: "selection", target: caption })).toBe(
      false,
    );
  });

  it("refuses other node types", () => {
    const view = new TableView(table(tr(th("a"))));

    expect(view.update(p("x"))).toBe(false);
  });
});

describe("tableView", () => {
  it("freezes the table the cursor enters and unfreezes it when it leaves", () => {
    const node = doc(p("x"), table(tr(th("a"), th("b"))), p("y"));
    const state = createState(node, { cursor: 1, plugins: [tableView()] });
    const editor = new EditorView(document.createElement("div"), { state });
    const freeze = vi.spyOn(TableView.prototype, "freeze");
    const unfreeze = vi.spyOn(TableView.prototype, "unfreeze");

    // into the first cell: paragraph, table, row, cell and paragraph open
    const select = (pos: number) =>
      editor.dispatch(
        editor.state.tr.setSelection(
          TextSelection.create(editor.state.doc, pos),
        ),
      );
    select(7);
    expect(freeze).toHaveBeenCalledTimes(1);

    select(1);
    expect(unfreeze).toHaveBeenCalledTimes(1);
    editor.destroy();
  });
});
