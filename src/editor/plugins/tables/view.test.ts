import { describe, expect, it, vi } from "vitest";
import { TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";

import { createState, doc, p, table, th, tr } from "../../../test/editor";
import { TableView, tableView } from "./view";

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

  it("renders the column widths set on the table", () => {
    const sized = (a: number, b: number) =>
      table(tr(th("a", { colwidth: [a] }), th("b", { colwidth: [b] })));
    const view = new TableView(sized(30, 70));
    const cols = () =>
      [...view.dom.querySelectorAll("col")].map((col) => col.style.width);
    const table_ = view.dom.querySelector("table")!;

    expect(cols()).toEqual(["30%", "70%"]);
    expect(table_.style.width).toBe("100%");
    expect(table_.style.tableLayout).toBe("fixed");

    view.update(sized(60, 40));
    expect(cols()).toEqual(["60%", "40%"]);

    // reset to automatic widths
    view.update(table(tr(th("a"), th("b"))));
    expect(cols()).toEqual([]);
    expect(table_.style.tableLayout).toBe("");
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
  it("renders tables with the view, and never measures them", () => {
    const node = doc(p("x"), table(tr(th("a"), th("b"))), p("y"));
    const state = createState(node, { cursor: 1, plugins: [tableView()] });
    const editor = new EditorView(document.createElement("div"), { state });
    const measure = vi.spyOn(Element.prototype, "getBoundingClientRect");

    expect(editor.dom.querySelector(".table-block table")).not.toBeNull();
    // into the first cell and out again
    for (const pos of [7, 1])
      editor.dispatch(
        editor.state.tr.setSelection(
          TextSelection.create(editor.state.doc, pos),
        ),
      );
    window.dispatchEvent(new Event("resize"));

    expect(measure).not.toHaveBeenCalled();
    editor.destroy();
  });
});
