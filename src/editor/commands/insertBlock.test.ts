import { describe, expect, it } from "vitest";

import { schema } from "../../markdown";
import {
  blockquote,
  codeBlock,
  createState,
  createTestView,
  doc,
  p,
} from "../../test/editor";
import insertBlock from "./insertBlock";

const pageBreak = () => schema.node("page_break");

/**
 * insert runs insertBlock at `cursor`, then types "x" there
 */
const insert = (node: ReturnType<typeof doc>, cursor: number) => {
  const view = createTestView(createState(node, { cursor }));
  expect(insertBlock(schema.nodes.page_break)(view.state, view.dispatch)).toBe(
    true,
  );
  view.dispatch(view.state.tr.insertText("x"));
  return view.state.doc;
};

describe("command.insertBlock", () => {
  it("splits the paragraph and goes on after the block", () => {
    expect(insert(doc(p("onetwo")), 4).toJSON()).toEqual(
      doc(p("one"), pageBreak(), p("xtwo")).toJSON(),
    );
  });

  it("adds a paragraph after a block at the end", () => {
    expect(insert(doc(p("one")), 4).toJSON()).toEqual(
      doc(p("one"), pageBreak(), p("x")).toJSON(),
    );
  });

  it("goes on in the paragraph that follows", () => {
    expect(insert(doc(p("one"), p("two")), 4).toJSON()).toEqual(
      doc(p("one"), pageBreak(), p("xtwo")).toJSON(),
    );
  });

  it("replaces an empty paragraph", () => {
    expect(insert(doc(p("one"), p()), 6).toJSON()).toEqual(
      doc(p("one"), pageBreak(), p("x")).toJSON(),
    );
  });

  it("stays in a quote", () => {
    expect(insert(doc(blockquote(p("one"))), 5).toJSON()).toEqual(
      doc(blockquote(p("one"), pageBreak(), p("x"))).toJSON(),
    );
  });

  it("leaves a code block first", () => {
    const view = createTestView(createState(doc(codeBlock("code"))));

    insertBlock(schema.nodes.page_break)(view.state, view.dispatch);

    expect(view.state.doc.toJSON()).toEqual(
      doc(codeBlock("code"), p()).toJSON(),
    );
  });

  it("can be applied without dispatching", () => {
    const state = createState(doc(p("one")));
    expect(insertBlock(schema.nodes.page_break)(state)).toBe(true);
  });
});
