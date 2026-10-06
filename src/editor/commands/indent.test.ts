import { afterEach, describe, expect, it } from "vitest";
import type { Node } from "prosemirror-model";
import type { EditorState } from "prosemirror-state";

import { CommandIdentifier, config } from "../../config";
import { createState, doc, h, li, marked, p, ul } from "../../test/editor";
import { bindKeys, withKeymap } from "../../test/keymap";
import { commandFor } from "../plugins/keymap";

// the view after pressing `keys` in `node`, with the cursor at its "|", or
// the selection between its two
const pressIn = (node: Node, ...keys: string[]) => {
  const { doc: start, cursor } = marked(node);
  const { view, press } = withKeymap(start, { cursor });
  const handled = keys.map((key) => press(key));
  return { state: view.state, handled };
};

const stateAt = (node: Node) => {
  const { doc: start, cursor } = marked(node);
  return createState(start, { cursor });
};

// the doc of `state` is `node`, and its selection where the "|" of `node` are
const expectAt = (state: EditorState, node: Node) => {
  const { doc: wanted, cursor } = marked(node);
  expect(state.doc.toJSON()).toEqual(wanted.toJSON());
  const [from, to] = typeof cursor === "number" ? [cursor, cursor] : cursor;
  expect([state.selection.from, state.selection.to]).toEqual([from, to]);
};

describe("Tab in text", () => {
  it("puts a tab at the cursor", () => {
    const { state, handled } = pressIn(doc(p("one|two")), "Tab");
    expect(handled).toEqual([true]);
    expectAt(state, doc(p("one\t|two")));
  });

  it("puts a tab in place of a selection on one line", () => {
    const { state } = pressIn(doc(p("o|ne| two")), "Tab");
    expectAt(state, doc(p("o\t| two")));
  });

  it("puts a tab in a heading", () => {
    const { state } = pressIn(doc(h(2, "|Title")), "Tab");
    expectAt(state, doc(h(2, "\t|Title")));
  });

  it("indents a whole line selected", () => {
    const { state } = pressIn(doc(p("|one|")), "Tab");
    expectAt(state, doc(p("|\tone|")));
  });

  it("indents every line of a selection over several", () => {
    const { state } = pressIn(doc(p("o|ne"), p("two"), p("th|ree")), "Tab");
    expectAt(state, doc(p("\to|ne"), p("\ttwo"), p("\tth|ree")));
  });

  it("leaves a line the selection ends at the start of alone", () => {
    const { state } = pressIn(doc(p("o|ne"), p("|two")), "Tab");
    expectAt(state, doc(p("\to|ne"), p("|two")));
  });

  it("indents the lines and the list items of a mixed selection", () => {
    const { state } = pressIn(
      doc(p("o|ne"), ul(li(p("a")), li(p("b|")))),
      "Tab",
    );
    expectAt(state, doc(p("\to|ne"), ul(li(p("a"), ul(li(p("b|")))))));
  });

  it("is one step in the history", () => {
    const { doc: start, cursor } = marked(doc(p("o|ne"), p("tw|o")));
    const { view, press } = withKeymap(start, { cursor });
    press("Tab");
    press("Tab");
    press("Mod-z");
    expect(view.state.doc.toJSON()).toEqual(
      doc(p("\tone"), p("\ttwo")).toJSON(),
    );
  });
});

describe("Shift-Tab in text", () => {
  it("takes a tab from the start of the line, wherever the cursor is", () => {
    const { state } = pressIn(doc(p("\tone|two")), "Shift-Tab");
    expectAt(state, doc(p("one|two")));
  });

  it("takes one from every line it can", () => {
    const { state } = pressIn(doc(p("\t\to|ne"), p("tw|o")), "Shift-Tab");
    expectAt(state, doc(p("\to|ne"), p("tw|o")));
  });

  it("keeps the key where there's no tab to take", () => {
    const { state, handled } = pressIn(doc(p("one|")), "Shift-Tab");
    expect(handled).toEqual([true]);
    expectAt(state, doc(p("one|")));
  });
});

describe("Tab in a list", () => {
  it("takes an item a level down from anywhere in it", () => {
    const { state } = pressIn(doc(ul(li(p("one")), li(p("t|wo")))), "Tab");
    expectAt(state, doc(ul(li(p("one"), ul(li(p("t|wo")))))));
  });

  it("keeps the key on the first item, which can't go down", () => {
    const { state, handled } = pressIn(doc(ul(li(p("o|ne")))), "Tab");
    expect(handled).toEqual([true]);
    expectAt(state, doc(ul(li(p("o|ne")))));
  });

  it("takes the selected items after the first down", () => {
    const { state } = pressIn(
      doc(ul(li(p("o|ne")), li(p("two")), li(p("thr|ee")))),
      "Tab",
    );
    expectAt(state, doc(ul(li(p("o|ne"), ul(li(p("two")), li(p("thr|ee")))))));
  });

  it("takes several items after the first down", () => {
    const { state } = pressIn(
      doc(ul(li(p("one")), li(p("t|wo")), li(p("thr|ee")))),
      "Tab",
    );
    expectAt(state, doc(ul(li(p("one"), ul(li(p("t|wo")), li(p("thr|ee")))))));
  });

  it("Shift-Tab takes an item up, and out of the list at the top", () => {
    const { state } = pressIn(
      doc(ul(li(p("one"), ul(li(p("t|wo")))))),
      "Shift-Tab",
      "Shift-Tab",
    );
    expectAt(state, doc(ul(li(p("one"))), p("t|wo")));
  });
});

describe("the toolbar's Indent and Outdent", () => {
  const indent = commandFor(CommandIdentifier.FORMAT_INDENT);
  const outdent = commandFor(CommandIdentifier.FORMAT_UNINDENT);

  it("indent the line the cursor is in", () => {
    const state = stateAt(doc(p("one|two")));
    let next = state;
    expect(indent(state, (tr) => (next = state.apply(tr)))).toBe(true);
    expect(next.doc.toJSON()).toEqual(doc(p("\tonetwo")).toJSON());
  });

  it("outdent only where there's a tab to take", () => {
    expect(outdent(stateAt(doc(p("one|"))))).toBe(false);
    expect(outdent(stateAt(doc(p("\tone|"))))).toBe(true);
  });

  it("can't indent the first item of a list", () => {
    expect(indent(stateAt(doc(ul(li(p("o|ne"))))))).toBe(false);
    expect(indent(stateAt(doc(ul(li(p("one")), li(p("t|wo"))))))).toBe(true);
  });
});

describe("a rebound Indent", () => {
  const keymap = config.value.keymap;

  afterEach(() => {
    config.value = { ...config.value, keymap };
  });

  it("runs what Tab ran on its own key", () => {
    bindKeys({ [CommandIdentifier.FORMAT_INDENT]: "Mod-]" });
    const { state, handled } = pressIn(doc(p("one|")), "Mod-]", "Tab");
    expectAt(state, doc(p("one\t|")));
    // Tab is no key of anything now
    expect(handled).toEqual([true, false]);
  });
});
