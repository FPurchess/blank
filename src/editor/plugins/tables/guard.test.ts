import { describe, expect, it } from "vitest";
import type { Node } from "prosemirror-model";
import { EditorState } from "prosemirror-state";

import { schema } from "../../schema";
import { doc, h, li, p, table, td, th, tr, ul } from "../../../test/editor";
import { tableGuard } from "./guard";

const small = () => table(tr(th("a")), tr(td("b")));

/**
 * guarded returns the document after a change that sets it to `node`
 */
const guarded = (node: Node, before: Node = doc(p())) => {
  const state = EditorState.create({
    schema,
    doc: before,
    plugins: [tableGuard()],
  });
  const tr = state.tr.replaceWith(0, state.doc.content.size, node.content);
  return state.apply(tr).doc;
};

describe("tableGuard", () => {
  it("keeps a paragraph after a table at the end of the document", () => {
    expect(guarded(doc(p("x"), small())).eq(doc(p("x"), small(), p()))).toBe(
      true,
    );
  });

  it("keeps a paragraph before a table at the start of the document", () => {
    expect(guarded(doc(small(), p("x"))).eq(doc(p(), small(), p("x")))).toBe(
      true,
    );
  });

  it("keeps a paragraph between two tables", () => {
    expect(
      guarded(doc(p(), small(), small(), p())).eq(
        doc(p(), small(), p(), small(), p()),
      ),
    ).toBe(true);
  });

  it("leaves a document without tables alone", () => {
    const state = EditorState.create({
      schema,
      doc: doc(p("x")),
      plugins: [tableGuard()],
    });
    const next = state.apply(state.tr.insertText("y", 1));

    expect(next.doc.eq(doc(p("yx")))).toBe(true);
  });

  it("turns a heading in a list in a cell into a paragraph", () => {
    const withHeading = doc(
      p(),
      table(tr(th("a")), tr(td(ul(li(p("one"), h(2, "title")))))),
      p(),
    );

    expect(
      guarded(withHeading).eq(
        doc(p(), table(tr(th("a")), tr(td(ul(li(p("one"), p("title")))))), p()),
      ),
    ).toBe(true);
  });

  it("flattens a table in a list in a cell", () => {
    const nested = doc(
      p(),
      table(tr(th("a")), tr(td(ul(li(p("one"), small()))))),
      p(),
    );

    expect(
      guarded(nested).eq(
        doc(
          p(),
          table(tr(th("a")), tr(td(ul(li(p("one"), p("a"), p("b")))))),
          p(),
        ),
      ),
    ).toBe(true);
  });

  it("replaces a rule in a list in a cell", () => {
    const rule = schema.nodes.horizontal_rule.create();
    const withRule = doc(
      p(),
      table(tr(th("a")), tr(td(ul(li(p("one"), rule))))),
      p(),
    );

    expect(
      guarded(withRule).eq(
        doc(p(), table(tr(th("a")), tr(td(ul(li(p("one"), p()))))), p()),
      ),
    ).toBe(true);
  });

  it("isn't undone on its own", () => {
    const state = EditorState.create({
      schema,
      doc: doc(p()),
      plugins: [tableGuard()],
    });
    const tr = state.tr.replaceWith(0, state.doc.content.size, small());
    const result = state.applyTransaction(tr);

    expect(result.transactions).toHaveLength(2);
    expect(result.transactions[1].getMeta("addToHistory")).toBe(false);
  });
});
