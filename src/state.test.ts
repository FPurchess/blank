import { beforeEach, describe, expect, it, vi } from "vitest";
import { Schema } from "prosemirror-model";
import { EditorState } from "prosemirror-state";
import { schema } from "prosemirror-markdown";

import { textContent, theme, transaction } from "./state";
import { doc, h, li, p, ul } from "./test/editor";

/**
 * emit publishes a transaction that replaces the whole doc with `node`.
 */
const emit = (node: ReturnType<typeof doc>) => {
  const state = EditorState.create({ schema: node.type.schema });
  transaction.value = state.tr.replaceWith(0, state.doc.content.size, node);
};

describe("state.textContent", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    transaction.value = null;
    vi.runAllTimers();
    textContent.value = "";
  });

  it("updates 50ms after the last transaction", () => {
    emit(doc(p("first")));
    vi.advanceTimersByTime(30);
    emit(doc(p("second")));
    vi.advanceTimersByTime(49);
    expect(textContent.value).toBe("");

    vi.advanceTimersByTime(1);
    expect(textContent.value).toBe("second");
  });

  it("joins blocks and collapses runs of whitespace", () => {
    emit(doc(h(1, "Title"), p(), p("one   two"), ul(li(p("item")))));
    vi.runAllTimers();

    expect(textContent.value).toBe("Title one two item");
  });

  it("ignores text marked as deleted", () => {
    const withDeletion = new Schema({
      nodes: schema.spec.nodes,
      marks: schema.spec.marks.addToEnd("deletion", {}),
    });
    const node = withDeletion.node("doc", null, [
      withDeletion.node("paragraph", null, [
        withDeletion.text("kept "),
        withDeletion.text("removed", [withDeletion.marks.deletion.create()]),
      ]),
    ]);

    emit(node);
    vi.runAllTimers();

    expect(textContent.value).toBe("kept");
  });

  it("ignores a reset transaction", () => {
    emit(doc(p("text")));
    vi.runAllTimers();

    transaction.value = null;
    vi.runAllTimers();

    expect(textContent.value).toBe("text");
  });
});

describe("state.theme", () => {
  it("applies the theme to the document body", () => {
    theme.value = "red";
    expect(document.body.dataset.theme).toBe("red");

    theme.value = "light";
    expect(document.body.dataset.theme).toBe("light");
  });
});
