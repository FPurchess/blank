import { EditorState, TextSelection } from "prosemirror-state";
import { describe, expect, it } from "vitest";

import { schema } from "../../markdown";
import { createTestView, doc, pressKey } from "../../test/editor";
import { inlineMath } from "../../test/math";
import { mathAround, mathInline, mathInlineKey } from "./mathInline";

// "a ", x^2, " b": the formula from 3 to 8, its source from 4 to 7
const setUp = (cursor: number, source = "x^2") => {
  const plugin = mathInline();
  const node = doc(
    schema.node("paragraph", null, [
      schema.text("a "),
      inlineMath(source),
      schema.text(" b"),
    ]),
  );
  const state = EditorState.create({ schema, doc: node, plugins: [plugin] });
  const view = createTestView(
    state.apply(state.tr.setSelection(TextSelection.create(state.doc, cursor))),
  );
  return { view, plugin };
};

const head = (view: ReturnType<typeof setUp>["view"]) =>
  view.state.selection.head;

describe("inline math in the editor", () => {
  it("steps into it and out of it one position at a time", () => {
    const { view, plugin } = setUp(3);
    expect(pressKey(view, plugin, "ArrowRight")).toBe(true);
    expect(head(view)).toBe(4);
    expect(mathAround(view.state)?.pos).toBe(3);
    // in its source, the webview moves the caret
    expect(pressKey(view, plugin, "ArrowRight")).toBe(false);
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 7)),
    );
    expect(pressKey(view, plugin, "ArrowRight")).toBe(true);
    expect(head(view)).toBe(8);
    expect(mathAround(view.state)).toBeNull();
    expect(pressKey(view, plugin, "ArrowLeft")).toBe(true);
    expect(head(view)).toBe(7);
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 4)),
    );
    expect(pressKey(view, plugin, "ArrowLeft")).toBe(true);
    expect(head(view)).toBe(3);
  });

  it("leaves it with Enter and Esc, without a break", () => {
    for (const key of ["Enter", "Escape", "Shift-Enter"]) {
      const { view, plugin } = setUp(5);
      if (key === "Shift-Enter") {
        // the shift of Shift+Enter leaves it as well
        expect(pressKey(view, plugin, "Enter")).toBe(true);
      } else expect(pressKey(view, plugin, key)).toBe(true);
      expect(head(view)).toBe(8);
      expect(view.state.doc.textContent).toBe("a x^2 b");
    }
  });

  it("turns back into its text with Backspace at its start", () => {
    const { view, plugin } = setUp(4);
    expect(pressKey(view, plugin, "Backspace")).toBe(true);
    const paragraph = view.state.doc.firstChild!;
    expect(paragraph.childCount).toBe(1);
    expect(paragraph.textContent).toBe("a $x^2$ b");
    // the caret after the opening $
    expect(head(view)).toBe(4);
    // remembered, so autocorrect doesn't make it a formula at once
    expect(mathInlineKey.getState(view.state)).toEqual({
      from: 3,
      to: 8,
      text: "$x^2$",
    });
  });

  it("turns back into its text with Delete at its end", () => {
    const { view, plugin } = setUp(7);
    expect(pressKey(view, plugin, "Delete")).toBe(true);
    expect(view.state.doc.textContent).toBe("a $x^2$ b");
    expect(head(view)).toBe(7);
  });

  it("closes with a $ typed at its end", () => {
    const { view, plugin } = setUp(7);
    const typed = plugin.props.handleTextInput?.call(
      plugin,
      view,
      7,
      7,
      "$",
      () => view.state.tr,
    );
    expect(typed).toBe(true);
    expect(head(view)).toBe(8);
    expect(view.state.doc.textContent).toBe("a x^2 b");
  });

  it("removes a formula left empty", () => {
    const { view } = setUp(4, "");
    expect(mathAround(view.state)?.node.content.size).toBe(0);
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)),
    );
    expect(view.state.doc.firstChild!.childCount).toBe(1);
    expect(view.state.doc.textContent).toBe("a  b");
  });

  it("removes a formula left empty by an edit that moved it", () => {
    const { view } = setUp(4, "");
    // text typed at the start of the paragraph moves it, and the caret
    // goes there
    const tr = view.state.tr.insertText("so ", 1);
    view.dispatch(tr.setSelection(TextSelection.create(tr.doc, 2)));
    expect(view.state.doc.textContent).toBe("so a  b");
    let formulas = 0;
    view.state.doc.descendants((node) => {
      if (node.type.name === "math_inline") formulas++;
    });
    expect(formulas).toBe(0);
  });
});
