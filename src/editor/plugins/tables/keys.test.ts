import { describe, expect, it } from "vitest";
import { history, undo } from "prosemirror-history";
import type { Node } from "prosemirror-model";
import { TextSelection, type EditorState } from "prosemirror-state";
import { CellSelection } from "prosemirror-tables";
import type { EditorView } from "prosemirror-view";

import { schema } from "../../../markdown";
import {
  codeBlock,
  createState,
  createTestView,
  doc,
  h,
  li,
  p,
  pressKey,
  table,
  td,
  th,
  tr,
  ul,
} from "../../../test/editor";
import { at, cellTexts, selectCells } from "../../../test/tables";
import { tableKeys } from "./keys";

const setup = (node: Node, cursor: number | [number, number]) => {
  const plugin = tableKeys();
  const view = createTestView(
    createState(node, { cursor, plugins: [history(), plugin] }),
  );
  // the stub view has no layout, so every arrow is at the end of its line
  (view as unknown as { endOfTextblock: () => boolean }).endOfTextblock = () =>
    true;
  return { view, press: (key: string) => pressKey(view, plugin, key) };
};

const grid = () =>
  table(tr(th("a"), th("b")), tr(td("c"), td("d")), tr(td("e"), td("f")));

// selects the cells from the one holding `from` to the one holding `to`
const selectIn = (view: EditorView, from: string, to: string) =>
  view.updateState(selectCells(view.state, from, to));

// the cells of each row, joined by commas
const texts = (state: EditorState) =>
  cellTexts(state.doc).map((row) => row.join(","));

describe("Tab", () => {
  it("moves to the next cell and selects its text", () => {
    const node = doc(grid());
    const { view, press } = setup(node, at(node, "a"));

    expect(press("Tab")).toBe(true);
    const { from, to } = view.state.selection;
    expect(view.state.doc.textBetween(from, to)).toBe("b");
  });

  it("moves to the previous cell with Shift", () => {
    const node = doc(grid());
    const { view, press } = setup(node, at(node, "b"));

    press("Shift-Tab");
    const { from, to } = view.state.selection;
    expect(view.state.doc.textBetween(from, to)).toBe("a");
  });

  it("stays in the first cell with Shift", () => {
    const node = doc(grid(), p());
    const { view, press } = setup(node, at(node, "a"));

    expect(press("Shift-Tab")).toBe(true);
    expect(view.state.doc.eq(node)).toBe(true);
  });

  it("adds a row after the last cell, in one undo step", () => {
    const node = doc(
      table(
        tr(th("a"), th("b", { align: "right" })),
        tr(td("c"), td("d", { align: "right" })),
      ),
      p(),
    );
    const { view, press } = setup(node, at(node, "d", 1));

    expect(press("Tab")).toBe(true);
    expect(texts(view.state)).toEqual(["a,b", "c,d", ","]);
    const added = view.state.doc.firstChild!.lastChild!;
    expect(added.child(0).type).toBe(schema.nodes.table_cell);
    expect(added.child(1).attrs.align).toBe("right");
    expect(view.state.selection.$head.node(-1)).toBe(added.child(0));

    undo(view.state, view.dispatch);
    expect(view.state.doc.eq(node)).toBe(true);
  });

  it("indents a list item in a cell from its start", () => {
    const list = ul(li(p("one")), li(p("two")));
    const node = doc(table(tr(th("a")), tr(td(list))), p());
    const { view, press } = setup(node, at(node, "two"));

    expect(press("Tab")).toBe(true);
    const cell = view.state.doc.firstChild!.lastChild!.firstChild!;
    expect(cell.firstChild!.childCount).toBe(1);
    expect(cell.textContent).toBe("onetwo");
  });

  it("moves on from the middle of a list item", () => {
    const list = ul(li(p("one")), li(p("two")));
    const node = doc(table(tr(th("a")), tr(td(list)), tr(td("x"))), p());
    const { view, press } = setup(node, at(node, "two", 1));

    press("Tab");
    const { from, to } = view.state.selection;
    expect(view.state.doc.textBetween(from, to)).toBe("x");
  });

  it("indents code in a cell, and outdents it, instead of moving on", () => {
    const node = doc(table(tr(th("a")), tr(td(codeBlock("x")), td("y"))), p());
    const { view, press } = setup(node, at(node, "x"));

    expect(press("Tab")).toBe(true);
    const code = () => view.state.doc.firstChild!.lastChild!.firstChild!;
    expect(code().textContent).toBe(" ".repeat(4) + "x");
    expect(press("Shift-Tab")).toBe(true);
    expect(code().textContent).toBe("x");
  });

  it("leaves Tab to the keymap outside tables", () => {
    const node = doc(p("text"));
    const { press } = setup(node, 3);

    expect(press("Tab")).toBe(false);
  });
});

describe("Enter", () => {
  it("inserts a line break in plain cell text", () => {
    const node = doc(grid(), p());
    const { view, press } = setup(node, at(node, "c", 1));

    expect(press("Enter")).toBe(true);
    const cell = view.state.doc.firstChild!.child(1).firstChild!;
    expect(cell.childCount).toBe(1);
    expect(cell.firstChild!.lastChild!.type).toBe(schema.nodes.hard_break);
  });

  it("starts a paragraph on an empty line after a line break", () => {
    const node = doc(grid(), p());
    const { view, press } = setup(node, at(node, "c", 1));

    press("Enter");
    press("Enter");
    const cell = view.state.doc.firstChild!.child(1).firstChild!;
    expect(cell.childCount).toBe(2);
    expect(cell.firstChild!.textContent).toBe("c");
    expect(cell.firstChild!.childCount).toBe(1);
    expect(view.state.selection.$head.parent).toBe(cell.lastChild);
  });

  it("replaces selected text with a line break", () => {
    const node = doc(table(tr(th("a")), tr(td("abc"))), p());
    const { view, press } = setup(node, [
      at(node, "abc", 1),
      at(node, "abc", 2),
    ]);

    press("Enter");
    const para = view.state.doc.firstChild!.lastChild!.firstChild!.firstChild!;
    expect(para.childCount).toBe(3);
    expect(para.textContent).toBe("ac");
  });

  it("leaves lists in cells to the keymap", () => {
    const node = doc(table(tr(th("a")), tr(td(ul(li(p("one")))))), p());
    const { press } = setup(node, at(node, "one", 3));

    expect(press("Enter")).toBe(false);
  });
});

describe("arrows", () => {
  it("leave the last row downwards into the text after the table", () => {
    const node = doc(grid(), p("after"));
    const { view, press } = setup(node, at(node, "e"));

    expect(press("ArrowDown")).toBe(true);
    expect(view.state.selection.$head.parent.textContent).toBe("after");
  });

  it("add a paragraph to leave a table at the end of the document", () => {
    const node = doc(p("x"), grid());
    const { view, press } = setup(node, at(node, "f", 1));

    expect(press("ArrowRight")).toBe(true);
    expect(view.state.doc.lastChild!.type).toBe(schema.nodes.paragraph);
    expect(view.state.selection.$head.parent).toBe(view.state.doc.lastChild);
  });

  it("add a paragraph to leave a table at the start of the document", () => {
    const node = doc(grid(), p("after"));
    const { view, press } = setup(node, at(node, "b"));

    expect(press("ArrowUp")).toBe(true);
    expect(view.state.doc.childCount).toBe(3);
    expect(view.state.selection.$head.pos).toBe(1);
  });

  it("add a paragraph between two tables", () => {
    const node = doc(p(), grid(), grid());
    const { view, press } = setup(node, at(node, "e"));

    press("ArrowDown");
    expect(view.state.doc.child(2).type).toBe(schema.nodes.paragraph);
    expect(view.state.selection.$head.parent).toBe(view.state.doc.child(2));
  });

  it("leave the first cell leftwards into the text before", () => {
    const node = doc(p("before"), grid());
    const { view, press } = setup(node, at(node, "a"));

    expect(press("ArrowLeft")).toBe(true);
    expect(view.state.selection.$head.parent.textContent).toBe("before");
  });

  it("stay in the table away from its edges", () => {
    const node = doc(p(), grid(), p());
    const { press } = setup(node, at(node, "c"));

    expect(press("ArrowDown")).toBe(false);
    expect(press("ArrowUp")).toBe(false);
    expect(press("ArrowRight")).toBe(false);
  });

  it("stay in a cell with more lines below the cursor", () => {
    const node = doc(
      p(),
      table(tr(th("a")), tr(td([p("one"), p("two")]))),
      p(),
    );
    const { press } = setup(node, at(node, "one"));

    expect(press("ArrowDown")).toBe(false);
  });
});

describe("Backspace", () => {
  it("clears the selected cells", () => {
    const node = doc(p(), grid(), p());
    const { view, press } = setup(node, 1);
    selectIn(view, "c", "c");

    expect(press("Backspace")).toBe(true);
    expect(texts(view.state)).toEqual(["a,b", ",d", "e,f"]);
  });

  it("clears a whole selected row instead of removing it", () => {
    const node = doc(p(), grid(), p());
    const { view, press } = setup(node, 1);
    selectIn(view, "c", "d");

    press("Backspace");
    expect(texts(view.state)).toEqual(["a,b", ",", "e,f"]);
  });

  it("clears a selected cell of a one-column table", () => {
    const node = doc(p(), table(tr(th("a")), tr(td("b"))), p());
    const { view, press } = setup(node, 1);
    selectIn(view, "b", "b");

    press("Delete");
    expect(texts(view.state)).toEqual(["a", ""]);
  });

  it("removes the table when all of it is selected", () => {
    const node = doc(p("x"), grid(), p("y"));
    const { view, press } = setup(node, 1);
    selectIn(view, "a", "f");

    press("Backspace");
    expect(view.state.doc.eq(doc(p("x"), p("y")))).toBe(true);
  });

  it("removes a table that is still empty from its first cell", () => {
    const node = doc(p("x"), table(tr(th(), th()), tr(td(), td())), p());
    // paragraph, table, row, cell and the cell's paragraph open before it
    const { view, press } = setup(node, 3 + 4);

    expect(press("Backspace")).toBe(true);
    expect(view.state.doc.eq(doc(p("x"), p()))).toBe(true);
  });

  it("leaves a table with text alone", () => {
    const node = doc(p(), table(tr(th("a"), th())), p());
    const { press } = setup(node, at(node, "a"));

    expect(press("Backspace")).toBe(false);
  });

  it("moves from the paragraph kept after a table into the table", () => {
    const node = doc(p("x"), grid(), p());
    const { view, press } = setup(node, node.content.size - 1);

    expect(press("Backspace")).toBe(true);
    expect(view.state.doc.eq(node)).toBe(true);
    expect(view.state.selection.$head.parent.textContent).toBe("f");
  });

  it("removes an empty line between a table and text", () => {
    const node = doc(grid(), p(), p("after"));
    const { view, press } = setup(node, grid().nodeSize + 1);

    press("Backspace");
    expect(view.state.doc.eq(doc(grid(), p("after")))).toBe(true);
    expect(view.state.selection.$head.parent.textContent).toBe("f");
  });

  it("leaves an empty heading after a table to the keymap", () => {
    const node = doc(grid(), h(2), p("after"));
    const { press } = setup(node, grid().nodeSize + 1);

    expect(press("Backspace")).toBe(false);
  });

  it("leaves a paragraph with text after a table to the keymap", () => {
    const node = doc(grid(), p("after"));
    const { press } = setup(node, grid().nodeSize + 1);

    expect(press("Backspace")).toBe(false);
  });
});

describe("Mod-a", () => {
  it("selects the cell, then the table, then leaves it to the keymap", () => {
    const node = doc(
      p(),
      table(tr(th("a")), tr(td([p("one"), p("two")]))),
      p(),
    );
    const { view, press } = setup(node, at(node, "one", 1));

    expect(press("Mod-a")).toBe(true);
    const { from, to } = view.state.selection;
    expect(view.state.selection).toBeInstanceOf(TextSelection);
    expect(view.state.doc.textBetween(from, to, "|")).toBe("one|two");

    expect(press("Mod-a")).toBe(true);
    const selection = view.state.selection as CellSelection;
    expect(selection).toBeInstanceOf(CellSelection);
    expect(selection.isRowSelection() && selection.isColSelection()).toBe(true);

    expect(press("Mod-a")).toBe(false);
  });

  it("selects the whole table from a partial cell selection", () => {
    const node = doc(p(), grid(), p());
    const { view, press } = setup(node, 1);
    selectIn(view, "a", "b");

    press("Mod-a");
    const selection = view.state.selection as CellSelection;
    expect(selection.isRowSelection() && selection.isColSelection()).toBe(true);
  });

  it("leaves Mod-a to the keymap outside tables", () => {
    const node = doc(p("text"));
    const { press } = setup(node, 2);

    expect(press("Mod-a")).toBe(false);
  });
});
