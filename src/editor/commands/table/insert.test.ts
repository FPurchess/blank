import { describe, expect, it } from "vitest";
import { TextSelection } from "prosemirror-state";

import { schema } from "../../schema";
import {
  createState,
  createTestView,
  doc,
  h,
  p,
  table,
  td,
  th,
  tr,
} from "../../../test/editor";
import { appendRow, createTable, insertTable } from "./insert";

describe("createTable", () => {
  it("creates a table with a header row", () => {
    expect(
      createTable(2, 3).eq(
        table(tr(th(), th()), tr(td(), td()), tr(td(), td())),
      ),
    ).toBe(true);
  });
});

describe("insertTable", () => {
  it("replaces an empty paragraph and puts the cursor in the first cell", () => {
    const view = createTestView(createState(doc(p("x"), p()), { cursor: 4 }));

    expect(insertTable(2, 2)(view.state, view.dispatch)).toBe(true);
    expect(view.state.doc.eq(doc(p("x"), createTable(2, 2)))).toBe(true);
    const { $head } = view.state.selection;
    expect($head.node(-1)).toBe(view.state.doc.child(1).firstChild!.firstChild);
  });

  it("goes after a block with text", () => {
    const view = createTestView(createState(doc(h(1, "Title")), { cursor: 3 }));

    insertTable(1, 2)(view.state, view.dispatch);
    expect(view.state.doc.eq(doc(h(1, "Title"), createTable(1, 2)))).toBe(true);
  });

  it("doesn't go into a table cell", () => {
    const node = doc(table(tr(th("a"))), p());
    const view = createTestView(createState(node, { cursor: 4 }));

    expect(insertTable(2, 2)(view.state, view.dispatch)).toBe(false);
    expect(view.state.doc.eq(node)).toBe(true);
  });

  it("tells whether it applies without a dispatch", () => {
    const state = createState(doc(p()), { cursor: 1 });

    expect(insertTable(2, 2)(state)).toBe(true);
  });
});

describe("appendRow", () => {
  it("adds a row with the cell types and alignment of the last one", () => {
    const node = doc(
      table(
        tr(th("a"), th("b", { align: "center" })),
        tr(th("c"), td("d", { align: "center" })),
      ),
    );
    const state = createState(node, { cursor: 4 });
    const next = state.apply(appendRow(state)!);

    const added = next.doc.firstChild!.lastChild!;
    expect(added.child(0).type).toBe(schema.nodes.table_header);
    expect(added.child(1).type).toBe(schema.nodes.table_cell);
    expect(added.child(1).attrs.align).toBe("center");
    expect(next.selection).toBeInstanceOf(TextSelection);
    expect(next.selection.$head.node(-1)).toBe(added.child(0));
  });

  it("does nothing outside tables", () => {
    expect(appendRow(createState(doc(p("x"))))).toBeUndefined();
  });
});
