import { history, undo } from "prosemirror-history";
import type { Node } from "prosemirror-model";
import { TextSelection } from "prosemirror-state";
import { afterEach, describe, expect, it } from "vitest";

import { config } from "../../../config";
import {
  createState,
  createTestView,
  doc,
  p,
  pressKey,
  typeText,
} from "../../../test/editor";
import { mathInline } from "../mathInline";
import autocomplete from ".";

const defaultConfig = config.value;
afterEach(() => {
  config.value = defaultConfig;
});

const setup = (text: string) => {
  const plugin = autocomplete();
  const keys = mathInline();
  const view = createTestView(
    createState(doc(p(text)), { plugins: [history(), keys, plugin] }),
  );
  return {
    view,
    type: (typed: string) => typeText(view, plugin, typed),
    press: (key: string) => pressKey(view, keys, key),
  };
};

// the paragraph as text, with formulas as $…$
const shown = (node: Node) => {
  let text = "";
  node.descendants((child) => {
    if (child.type.name === "math_inline") {
      text += `[${child.textContent}]`;
      return false;
    }
    if (child.isText) text += child.text;
    return true;
  });
  return text;
};

describe("math as you type", () => {
  it("turns $…$ into a formula after the next space", () => {
    const { view, type } = setup("so ");
    type("$x^2$ ");
    expect(shown(view.state.doc)).toBe("so [x^2] ");
  });

  it("turns it into a formula after punctuation and Enter too", () => {
    const { view, type } = setup("");
    type("$a$.");
    expect(shown(view.state.doc)).toBe("[a].");
  });

  it("keeps prices text", () => {
    for (const text of ["$5 and $10 ", "Costs 100$ and 5$ ", "$5-$10 "]) {
      const { view, type } = setup("");
      type(text);
      expect(shown(view.state.doc)).toBe(text);
    }
  });

  it("leaves the source alone while it's typed", () => {
    const { view, type } = setup("");
    // no dash, no capital, no italic, no curly quote inside
    type("$f'(c) -- a_b_ x$ ");
    expect(shown(view.state.doc)).toBe("[f'(c) -- a_b_ x] ");
  });

  it("still corrects the rest of a sentence after a price", () => {
    const { view, type } = setup("");
    type("It costs $5 -- fine ");
    expect(shown(view.state.doc)).toBe("It costs $5 – fine ");
  });

  it("never makes a formula across a line break", () => {
    const { view, type } = setup("");
    type("$a");
    view.dispatch(
      view.state.tr.replaceSelectionWith(
        view.state.schema.nodes.hard_break.create(),
      ),
    );
    type("b$ ");
    let breaks = 0;
    view.state.doc.descendants((node) => {
      if (node.type.name === "hard_break") breaks++;
    });
    expect(breaks).toBe(1);
    expect(shown(view.state.doc)).toBe("$ab$ ");
  });

  it("leaves a long source alone while it's typed", () => {
    const { view, type } = setup("");
    const long = `${"a+".repeat(60)}b -- c`;
    type(`$${long}$ `);
    expect(shown(view.state.doc)).toBe(`[${long}] `);
  });

  it("is undone like any correction", () => {
    const { view, type } = setup("");
    type("$x$ ");
    expect(shown(view.state.doc)).toBe("[x] ");
    undo(view.state, view.dispatch);
    expect(shown(view.state.doc)).toBe("$x$ ");
  });

  it("can be turned off", () => {
    config.value = {
      ...defaultConfig,
      autocorrect: { ...defaultConfig.autocorrect, math: false },
    };
    const { view, type } = setup("");
    type("$x$ ");
    expect(shown(view.state.doc)).toBe("$x$ ");
  });

  it("doesn't turn a formula turned back into text into one at once", () => {
    const { view, type, press } = setup("");
    type("$x$ ");
    // into it, then Backspace at its start
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)),
    );
    expect(press("Backspace")).toBe(true);
    expect(shown(view.state.doc)).toBe("$x$ ");
    // the space after it again: still text
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 4)),
    );
    type(" ");
    expect(shown(view.state.doc)).toBe("$x$  ");
    // a new closing $ makes it one again
    view.dispatch(view.state.tr.delete(3, 4));
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 3)),
    );
    type("y$ ");
    expect(shown(view.state.doc)).toContain("[xy]");
  });
});
