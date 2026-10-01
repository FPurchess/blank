import { afterEach, describe, expect, it } from "vitest";
import type { Node } from "prosemirror-model";
import { history, undo, undoDepth } from "prosemirror-history";

import { config } from "../../config";
import {
  codeBlock,
  createState,
  createTestView,
  doc,
  li,
  p,
  pressKey,
  type StateOptions,
  ul,
} from "../../test/editor";
import { keymap } from "../plugins/keymap";
import { columnOf } from "./codeIndent";

// Tab and Shift-Tab in code blocks, through the keymap, as the user presses
// them. The code block's text starts at position 1.

const setup = (node: Node, options: StateOptions = {}) => {
  const plugin = keymap();
  const view = createTestView(
    createState(node, { ...options, plugins: [history(), plugin] }),
  );
  return { view, press: (combo: string) => pressKey(view, plugin, combo) };
};

// the [from, to] of the text from `start` to `end` in the code block
const span = (code: string, start: string, end: string): [number, number] => [
  1 + code.indexOf(start),
  1 + code.indexOf(end) + end.length,
];

const code = (view: ReturnType<typeof setup>["view"]) =>
  view.state.doc.firstChild!.textContent;

const selected = (view: ReturnType<typeof setup>["view"]) =>
  view.state.doc.textBetween(
    view.state.selection.from,
    view.state.selection.to,
    "\n",
  );

describe("columnOf", () => {
  it("counts a tab to the next tab stop", () => {
    expect(columnOf("", 4)).toBe(0);
    expect(columnOf("  ", 4)).toBe(2);
    expect(columnOf("\t", 4)).toBe(4);
    expect(columnOf("  \t", 4)).toBe(4);
    expect(columnOf("\t  ", 4)).toBe(6);
    expect(columnOf("    \t", 4)).toBe(8);
  });
});

describe("code blocks: Tab and Shift-Tab", () => {
  const defaultConfig = config.value;

  afterEach(() => {
    config.value = defaultConfig;
  });

  it("outdents every selected line to the previous tab stop", () => {
    const text = "a\n      six\n  two\n    four\nend";
    const { view, press } = setup(doc(codeBlock(text)), {
      cursor: span(text, "six", "four"),
    });
    expect(press("Shift-Tab")).toBe(true);
    expect(code(view)).toBe("a\n    six\ntwo\nfour\nend");
  });

  it("indents every selected line to the next tab stop", () => {
    const text = "  two\nnone\n     five";
    const { view, press } = setup(doc(codeBlock(text)), {
      cursor: [1, text.length + 1],
    });
    expect(press("Tab")).toBe(true);
    expect(code(view)).toBe("    two\n    none\n        five");
  });

  it("leaves lines without indentation and empty lines as they are", () => {
    const text = "    a\nb\n\n    c";
    const { view, press } = setup(doc(codeBlock(text)), {
      cursor: [1, text.length + 1],
    });
    press("Shift-Tab");
    expect(code(view)).toBe("a\nb\n\nc");
    // an empty line gets no indentation either
    press("Tab");
    expect(code(view)).toBe("    a\n    b\n\n    c");
  });

  it("outdents lines of only spaces too", () => {
    const text = "    a\n      \n    b";
    const { view, press } = setup(doc(codeBlock(text)), {
      cursor: [1, text.length + 1],
    });
    press("Shift-Tab");
    expect(code(view)).toBe("a\n    \nb");
  });

  it("keeps tabs as tabs", () => {
    const text = "\t\ta\n\tb";
    const { view, press } = setup(doc(codeBlock(text)), {
      cursor: [1, text.length + 1],
    });
    press("Shift-Tab");
    expect(code(view)).toBe("\ta\nb");
    // b has none left, and takes the block's tabs
    press("Tab");
    expect(code(view)).toBe("\t\ta\n\tb");
  });

  it("measures mixed tabs and spaces in columns and writes them in the line's style", () => {
    // "\t  " reaches column 6 and "  \t" column 4
    const text = "\t  a\n  \tb\n      c";
    const { view, press } = setup(doc(codeBlock(text)), {
      cursor: [1, text.length + 1],
    });
    press("Shift-Tab");
    expect(code(view)).toBe("\ta\nb\n    c");
  });

  it("leaves out the last line when the selection ends at its start", () => {
    const text = "    a\n    b";
    const { view, press } = setup(doc(codeBlock(text)), {
      cursor: [1, 1 + text.indexOf("    b")],
    });
    press("Shift-Tab");
    expect(code(view)).toBe("a\n    b");
  });

  it("keeps the same lines selected, so another press goes on", () => {
    const text = "x\n        a\n        b\ny";
    const { view, press } = setup(doc(codeBlock(text)), {
      cursor: span(text, "a", "b"),
    });
    press("Shift-Tab");
    expect(selected(view)).toBe("a\n    b");
    press("Shift-Tab");
    expect(code(view)).toBe("x\na\nb\ny");
    expect(selected(view)).toBe("a\nb");
    // from the start of a line, the selection takes in its new indentation,
    // so whole lines stay selected
    press("Tab");
    expect(selected(view)).toBe("    a\n    b");
  });

  it("keeps a backward selection backward", () => {
    const text = "    a\n    b";
    const [from, to] = span(text, "a", "b");
    const { view, press } = setup(doc(codeBlock(text)), {
      cursor: [to, from],
    });
    press("Shift-Tab");
    const { anchor, head } = view.state.selection;
    expect(anchor).toBeGreaterThan(head);
    expect(selected(view)).toBe("a\nb");
  });

  it("is one undo step per press", () => {
    const text = "        a\n        b";
    const { view, press } = setup(doc(codeBlock(text)), {
      cursor: [1, text.length + 1],
    });
    press("Shift-Tab");
    press("Shift-Tab");
    expect(undoDepth(view.state)).toBe(2);
    undo(view.state, view.dispatch);
    expect(code(view)).toBe("    a\n    b");
  });

  it("inserts one step at a cursor with Tab", () => {
    const text = "ab";
    const { view, press } = setup(doc(codeBlock(text)), { cursor: 2 });
    press("Tab");
    // from column 1 to the tab stop at 4
    expect(code(view)).toBe("a   b");
    expect(view.state.selection.from).toBe(5);
  });

  it("inserts a tab at a cursor in a line indented with tabs", () => {
    const text = "\tab";
    const { view, press } = setup(doc(codeBlock(text)), { cursor: 3 });
    press("Tab");
    expect(code(view)).toBe("\ta\tb");
  });

  it("outdents the cursor's line with Shift-Tab", () => {
    const text = "x\n      ab";
    const { view, press } = setup(doc(codeBlock(text)), {
      cursor: 1 + text.indexOf("b"),
    });
    press("Shift-Tab");
    expect(code(view)).toBe("x\n    ab");
    // the cursor stays before the b
    expect(view.state.doc.textBetween(view.state.selection.from, 1 + 8)).toBe(
      "b",
    );
  });

  it("does nothing, but keeps the key, on a line without indentation", () => {
    const { view, press } = setup(doc(codeBlock("ab")), { cursor: 2 });
    const before = view.state;
    expect(press("Shift-Tab")).toBe(true);
    expect(view.state).toBe(before);
  });

  it("indents by the size set in blank.json", () => {
    config.value = { ...defaultConfig, editor: { indentSize: 2 } };
    const text = "a\n   b\n    c";
    const { view, press } = setup(doc(codeBlock(text)), {
      cursor: [1, text.length + 1],
    });
    press("Tab");
    expect(code(view)).toBe("  a\n    b\n      c");
    press("Shift-Tab");
    press("Shift-Tab");
    expect(code(view)).toBe("a\nb\n  c");
  });

  it("leaves Tab in lists to the list commands", () => {
    const { view, press } = setup(doc(ul(li(p("one")), li(p("two")))), {
      cursor: 10,
    });
    expect(press("Tab")).toBe(true);
    expect(view.state.doc.firstChild!.childCount).toBe(1);
  });

  it("doesn't take Tab outside code blocks", () => {
    const { press } = setup(doc(p("text")), { cursor: 2 });
    expect(press("Tab")).toBe(false);
    expect(press("Shift-Tab")).toBe(false);
  });

  it("doesn't take a selection that leaves the code block", () => {
    const { press } = setup(doc(codeBlock("    a"), p("b")), {
      cursor: [2, 10],
    });
    expect(press("Shift-Tab")).toBe(false);
  });
});
