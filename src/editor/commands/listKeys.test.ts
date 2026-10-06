import { describe, expect, it } from "vitest";
import type { Node } from "prosemirror-model";
import type { EditorState } from "prosemirror-state";

import { schema } from "../../markdown";
import {
  blockquote,
  codeBlock,
  createState,
  doc,
  li,
  marked,
  ol,
  p,
  table,
  td,
  tr,
  ul,
} from "../../test/editor";
import { withKeymap } from "../../test/keymap";
import { backspaceInList, joinAfterList } from "./listKeys";

// a numbered list that starts at `order`
const olFrom = (order: number, ...items: Node[]) =>
  schema.node("ordered_list", { order }, items);

// the state after pressing `keys` in `node`, with the cursor at its "|"
const pressIn = (node: Node, ...keys: string[]) => {
  const { doc: start, cursor } = marked(node);
  const { view, press } = withKeymap(start, { cursor });
  for (const key of keys) press(key);
  return view.state;
};

// a state of `node` with the cursor at its "|"
const stateAt = (node: Node) => {
  const { doc: start, cursor } = marked(node);
  return createState(start, { cursor });
};

// the doc and cursor of `state` are those of `node`, with the cursor at its "|"
const expectAt = (state: EditorState, node: Node) => {
  const { doc: wanted, cursor } = marked(node);
  expect(state.doc.toJSON()).toEqual(wanted.toJSON());
  expect(state.selection.from).toBe(cursor);
};

describe("Enter on an empty list item", () => {
  it("ends the list at the end of it", () => {
    const state = pressIn(doc(ul(li(p("one")), li(p("|")))), "Enter");
    expectAt(state, doc(ul(li(p("one"))), p("|")));
  });

  it("ends the list after Enter twice at the end of an item", () => {
    const state = pressIn(doc(ul(li(p("one|")))), "Enter", "Enter");
    expectAt(state, doc(ul(li(p("one"))), p("|")));
  });

  it("splits the list in the middle of it", () => {
    const state = pressIn(
      doc(ul(li(p("one")), li(p("|")), li(p("two")))),
      "Enter",
    );
    expectAt(state, doc(ul(li(p("one"))), p("|"), ul(li(p("two")))));
  });

  it("numbers the second part of a split numbered list from 1", () => {
    const state = pressIn(
      doc(olFrom(5, li(p("one")), li(p("|")), li(p("two")))),
      "Enter",
    );
    expectAt(
      state,
      doc(olFrom(5, li(p("one"))), p("|"), olFrom(1, li(p("two")))),
    );
  });

  it("keeps the start of a numbered list when its first item goes", () => {
    const state = pressIn(doc(olFrom(5, li(p("|")), li(p("two")))), "Enter");
    expectAt(state, doc(p("|"), olFrom(5, li(p("two")))));
  });

  it("leaves nested lists at once, from the last item", () => {
    const state = pressIn(
      doc(ul(li(p("one"), ul(li(p("a")), li(p("|")))))),
      "Enter",
    );
    expectAt(state, doc(ul(li(p("one"), ul(li(p("a"))))), p("|")));
  });

  it("leaves three nested lists with Enter twice at the end of an item", () => {
    const state = pressIn(
      doc(ul(li(p("a"), ul(li(p("b"), ul(li(p("c|")))))))),
      "Enter",
      "Enter",
    );
    expectAt(
      state,
      doc(ul(li(p("a"), ul(li(p("b"), ul(li(p("c"))))))), p("|")),
    );
  });

  it("splits nested lists in the middle, the items after it a list below", () => {
    const state = pressIn(
      doc(ul(li(p("one"), ul(li(p("a")), li(p("|")), li(p("b")))))),
      "Enter",
    );
    expectAt(
      state,
      doc(ul(li(p("one"), ul(li(p("a"))))), p("|"), ul(li(p("b")))),
    );
  });

  it("is one step in the history", () => {
    const { doc: start, cursor } = marked(
      doc(ul(li(p("a"), ul(li(p("b"), ul(li(p("|")))))))),
    );
    const { view, press } = withKeymap(start, { cursor });
    press("Enter");
    press("Mod-z");
    expect(view.state.doc.eq(start)).toBe(true);
  });

  it("ends a list in a quote inside the quote", () => {
    const state = pressIn(
      doc(blockquote(ul(li(p("one")), li(p("|"))))),
      "Enter",
    );
    expectAt(state, doc(blockquote(ul(li(p("one"))), p("|"))));
  });

  it("splits an item with only a nested list as before", () => {
    const state = pressIn(doc(ul(li(p("|"), ul(li(p("a")))))), "Enter");
    expect(state.doc.toJSON()).toEqual(
      doc(ul(li(p()), li(p(), ul(li(p("a")))))).toJSON(),
    );
  });

  it("leaves Enter in a code block in a list to the code", () => {
    const state = pressIn(doc(ul(li(codeBlock("|")))), "Enter");
    expect(state.doc.firstChild!.firstChild!.firstChild!.textContent).toBe(
      "\n",
    );
  });
});

describe("Backspace at the start of a list item", () => {
  it("deletes an empty item, the cursor at the end of the one above", () => {
    const state = pressIn(doc(ul(li(p("one")), li(p("|")))), "Backspace");
    expectAt(state, doc(ul(li(p("one|")))));
  });

  it("deletes an empty item in the middle of a list", () => {
    const state = pressIn(
      doc(ol(li(p("one")), li(p("|")), li(p("two")))),
      "Backspace",
    );
    expectAt(state, doc(ol(li(p("one|")), li(p("two")))));
  });

  it("deletes the only item of a nested list with the list", () => {
    const state = pressIn(doc(ul(li(p("one"), ul(li(p("|")))))), "Backspace");
    expectAt(state, doc(ul(li(p("one|")))));
  });

  it("deletes the first item of a nested list", () => {
    const state = pressIn(
      doc(ul(li(p("one"), ul(li(p("|")), li(p("a")))))),
      "Backspace",
    );
    expectAt(state, doc(ul(li(p("one|"), ul(li(p("a")))))));
  });

  it("turns an empty first item of a list into a paragraph", () => {
    const state = pressIn(doc(p("intro"), ul(li(p("|")))), "Backspace");
    expectAt(state, doc(p("intro"), p("|")));
  });

  it("takes an item with text up a level, then joins it", () => {
    let state = pressIn(
      doc(ul(li(p("apple"), ul(li(p("|pear")))))),
      "Backspace",
    );
    expectAt(state, doc(ul(li(p("apple")), li(p("|pear")))));

    const { view, press } = withKeymap(state.doc, {
      cursor: state.selection.from,
    });
    press("Backspace");
    state = view.state;
    expectAt(state, doc(ul(li(p("apple"))), p("|pear")));

    press("Backspace");
    expectAt(view.state, doc(ul(li(p("apple|pear")))));
  });

  it("takes an item two levels down out in three presses", () => {
    const state = pressIn(
      doc(ul(li(p("a"), ul(li(p("b"), ul(li(p("|c")))))))),
      "Backspace",
      "Backspace",
    );
    expectAt(state, doc(ul(li(p("a"), ul(li(p("b")))), li(p("|c")))));
  });

  it("splits a list at an item it takes out, and closes it again", () => {
    const start = doc(ol(li(p("one")), li(p("|two")), li(p("three"))));
    const split = pressIn(start, "Backspace");
    expectAt(split, doc(ol(li(p("one"))), p("|two"), ol(li(p("three")))));

    const joined = pressIn(start, "Backspace", "Backspace");
    expectAt(joined, doc(ol(li(p("one|two")), li(p("three")))));
  });

  it("takes the first item of a list out", () => {
    const state = pressIn(doc(ul(li(p("|one")), li(p("two")))), "Backspace");
    expectAt(state, doc(p("|one"), ul(li(p("two")))));
  });

  it("deletes a selection in a list as it is", () => {
    const state = pressIn(doc(ul(li(p("o|ne|")), li(p("two")))), "Backspace");
    expectAt(state, doc(ul(li(p("o|")), li(p("two")))));
  });

  it("leaves an item that starts with code to the code", () => {
    // to joinBackward, as before, which needs a real view
    expect(
      backspaceInList(stateAt(doc(ul(li(p("one")), li(codeBlock("|x")))))),
    ).toBe(false);
  });

  it("works on a list in a table cell", () => {
    const state = pressIn(
      doc(table(tr(td(ul(li(p("one")), li(p("|"))))))),
      "Backspace",
    );
    expectAt(state, doc(table(tr(td(ul(li(p("one|"))))))));
  });
});

describe("Backspace at the start of the paragraph after a list", () => {
  it("joins it to the list's last line", () => {
    const state = pressIn(
      doc(ul(li(p("one"), ul(li(p("a"))))), p("|text")),
      "Backspace",
    );
    expectAt(state, doc(ul(li(p("one"), ul(li(p("a|text")))))));
  });

  it("deletes an empty one", () => {
    const state = pressIn(doc(ul(li(p("one"))), p("|")), "Backspace");
    expectAt(state, doc(ul(li(p("one|")))));
  });

  it("joins the lists of the same kind on both sides", () => {
    const state = pressIn(
      doc(ul(li(p("one"))), p("|"), ul(li(p("two")))),
      "Backspace",
    );
    expectAt(state, doc(ul(li(p("one|")), li(p("two")))));
  });

  it("leaves lists of two kinds apart", () => {
    const state = pressIn(
      doc(ul(li(p("one"))), p("|"), ol(li(p("two")))),
      "Backspace",
    );
    expectAt(state, doc(ul(li(p("one|"))), ol(li(p("two")))));
  });

  it("leaves a list that ends with a table as before", () => {
    const list = ul(li(p("one"), table(tr(td("cell")))));
    expect(joinAfterList(stateAt(doc(list, p("|text"))))).toBe(false);
  });

  it("leaves a list that ends with code as before", () => {
    expect(
      joinAfterList(stateAt(doc(ul(li(codeBlock("x"))), p("|text")))),
    ).toBe(false);
  });
});
