import { describe, expect, it } from "vitest";
import { schema } from "prosemirror-markdown";

import {
  codeBlock,
  createState,
  createTestView,
  doc,
  p,
} from "../../test/editor";
import insertNode from "./insertNode";

describe("command.insertNode", () => {
  it("inserts the node at the cursor", () => {
    const view = createTestView(createState(doc(p("ab")), { cursor: 2 }));

    expect(insertNode(schema.nodes.hard_break)(view.state, view.dispatch)).toBe(
      true,
    );

    expect(view.state.doc.toJSON()).toEqual(
      doc(
        schema.node("paragraph", null, [
          schema.text("a"),
          schema.nodes.hard_break.create(),
          schema.text("b"),
        ]),
      ).toJSON(),
    );
  });

  it("replaces the selection", () => {
    const view = createTestView(createState(doc(p("abc")), { cursor: [1, 4] }));

    insertNode(schema.nodes.horizontal_rule)(view.state, view.dispatch);

    expect(view.state.doc.child(0).type.name).toBe("horizontal_rule");
    expect(view.state.doc.textContent).toBe("");
  });

  it("leaves a code block instead of inserting into it", () => {
    const view = createTestView(createState(doc(codeBlock("let a"))));

    insertNode(schema.nodes.hard_break)(view.state, view.dispatch);

    expect(view.state.doc.toJSON()).toEqual(
      doc(codeBlock("let a"), p()).toJSON(),
    );
    expect(view.state.selection.$from.parent.type.name).toBe("paragraph");
  });

  it("only checks applicability without dispatch", () => {
    const state = createState(doc(p("ab")));

    expect(insertNode(schema.nodes.hard_break)(state)).toBe(true);
  });
});
