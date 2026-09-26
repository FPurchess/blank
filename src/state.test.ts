import { beforeEach, describe, expect, it, vi } from "vitest";
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

  it("keeps pipes as part of the text", () => {
    emit(doc(p("a || b")));
    vi.runAllTimers();

    expect(textContent.value).toBe("a || b");
  });

  it("separates the words around a hard break", () => {
    emit(
      doc(
        schema.node("paragraph", null, [
          schema.text("roses are red"),
          schema.node("hard_break"),
          schema.text("violets are blue"),
        ]),
      ),
    );
    vi.runAllTimers();

    expect(textContent.value).toBe("roses are red violets are blue");
  });

  it("separates paragraphs", () => {
    emit(doc(p("first"), p("second")));
    vi.runAllTimers();

    expect(textContent.value).toBe("first second");
  });

  it("is empty for an empty doc", () => {
    emit(doc(p()));
    vi.runAllTimers();

    expect(textContent.value).toBe("");
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
