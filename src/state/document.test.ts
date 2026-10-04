import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EditorState } from "prosemirror-state";
import { nextTick } from "vue";
import { schema } from "../markdown";

import { bootDocumentState, textContent, transaction } from "./document";
import { doc, h, li, p, ul } from "../test/editor";

/**
 * emit publishes a transaction that replaces the whole doc with `node`.
 */
const emit = async (node: ReturnType<typeof doc>) => {
  const state = EditorState.create({ schema: node.type.schema });
  transaction.value = state.tr.replaceWith(0, state.doc.content.size, node);
  // the watcher runs once the tick's writes are done
  await nextTick();
};

describe("textContent", () => {
  let dispose = () => {};

  beforeEach(() => {
    vi.useFakeTimers();
    transaction.value = null;
    textContent.value = "";
    dispose = bootDocumentState();
  });

  afterEach(() => {
    dispose();
    vi.useRealTimers();
  });

  it("updates 50ms after the last transaction", async () => {
    await emit(doc(p("first")));
    vi.advanceTimersByTime(30);
    await emit(doc(p("second")));
    vi.advanceTimersByTime(49);
    expect(textContent.value).toBe("");

    vi.advanceTimersByTime(1);
    expect(textContent.value).toBe("second");
  });

  it("joins blocks and collapses runs of whitespace", async () => {
    await emit(doc(h(1, "Title"), p(), p("one   two"), ul(li(p("item")))));
    vi.runAllTimers();

    expect(textContent.value).toBe("Title one two item");
  });

  it("keeps pipes as part of the text", async () => {
    await emit(doc(p("a || b")));
    vi.runAllTimers();

    expect(textContent.value).toBe("a || b");
  });

  it("separates the words around a hard break", async () => {
    await emit(
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

  it("separates paragraphs", async () => {
    await emit(doc(p("first"), p("second")));
    vi.runAllTimers();

    expect(textContent.value).toBe("first second");
  });

  it("is empty for an empty doc", async () => {
    await emit(doc(p()));
    vi.runAllTimers();

    expect(textContent.value).toBe("");
  });

  it("ignores a reset transaction", async () => {
    await emit(doc(p("text")));
    vi.runAllTimers();

    transaction.value = null;
    vi.runAllTimers();

    expect(textContent.value).toBe("text");
  });

  it("stops following the transactions once disposed", async () => {
    await emit(doc(p("first")));
    dispose();
    vi.runAllTimers();
    await emit(doc(p("second")));
    vi.runAllTimers();

    expect(textContent.value).toBe("");
  });

  it("starts one timer for all the transactions of a tick", async () => {
    const timers = vi.spyOn(globalThis, "setTimeout");
    const state = EditorState.create({ schema: doc(p()).type.schema });
    transaction.value = state.tr.insertText("a");
    transaction.value = state.tr.insertText("ab");
    transaction.value = state.tr.insertText("abc");
    await nextTick();
    expect(timers).toHaveBeenCalledOnce();
    vi.runAllTimers();
    expect(textContent.value).toBe("abc");
  });
});
