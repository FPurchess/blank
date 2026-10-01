import { EditorState, NodeSelection, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { afterEach, describe, expect, it, vi } from "vitest";

import { schema } from "../../markdown";
import { pageDropCaret } from "../../state";
import { doc, p } from "../../test/editor";
import { hidePages, showPages } from "../../test/engine";
import { testLayout } from "../../test/layout";
import { documentFields } from "../../layout/bands";
import {
  dragCopies,
  dropExternal,
  dropMoved,
  moveCandidate,
  showDropAt,
} from "../pagePointer";
import { pageDrop } from "./pageDrop";

// "hello world" with "hello" selected
const selected = () => {
  const state = EditorState.create({ schema, doc: doc(p("hello world")) });
  return state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, 1, 6)),
  );
};

const run = (state: EditorState, command: ReturnType<typeof pageDrop>) => {
  let next = state;
  const done = command(state, (tr) => (next = state.apply(tr)));
  return { done, next };
};

describe("pageDrop", () => {
  it("moves the dragged text to where it's dropped, and selects it", () => {
    const state = selected();
    const { next } = run(
      state,
      pageDrop(state.selection.content(), 12, { from: 1, to: 6 }),
    );
    expect(next.doc.textContent).toBe(" worldhello");
    expect(next.doc.textBetween(next.selection.from, next.selection.to)).toBe(
      "hello",
    );
  });

  it("copies it without the range it came from", () => {
    const state = selected();
    const { next } = run(state, pageDrop(state.selection.content(), 12, null));
    expect(next.doc.textContent).toBe("hello worldhello");
  });

  it("leaves text dropped onto itself where it is", () => {
    const state = selected();
    const { done, next } = run(
      state,
      pageDrop(state.selection.content(), 3, { from: 1, to: 6 }),
    );
    expect(done).toBe(true);
    expect(next).toBe(state);
  });

  it("selects a dropped node", () => {
    const image = schema.nodes.image.create({ src: "a.png" });
    let state = EditorState.create({
      schema,
      doc: doc(p("ab"), p("cd")),
    });
    state = state.apply(state.tr.insert(1, image));
    state = state.apply(
      state.tr.setSelection(NodeSelection.create(state.doc, 1)),
    );
    const { next } = run(
      state,
      pageDrop(state.selection.content(), 7, { from: 1, to: 2 }),
    );
    expect(next.selection).toBeInstanceOf(NodeSelection);
    expect((next.selection as NodeSelection).node.type.name).toBe("image");
    expect(next.doc.textContent).toBe("abcd");
  });
});

describe("dragging on the pages", () => {
  afterEach(() => {
    hidePages();
    pageDropCaret.value = null;
  });

  it("starts only in the selected text", () => {
    const state = selected();
    expect(moveCandidate(state, 3)).toBe(true);
    expect(moveCandidate(state, 1)).toBe(false);
    expect(moveCandidate(state, 8)).toBe(false);
    expect(moveCandidate(state, null)).toBe(false);
  });

  it("copies with the modifier ProseMirror copies with", () => {
    // jsdom isn't a Mac
    expect(dragCopies({ ctrlKey: true, altKey: false })).toBe(true);
    expect(dragCopies({ ctrlKey: false, altKey: true })).toBe(false);
  });

  it("shows where it drops, and moves it there", () => {
    const engine = showPages();
    const view = new EditorView(document.createElement("div"), {
      state: selected(),
    });
    engine.setSettings(testLayout(), documentFields(view.state.doc));
    engine.sync(view.state.doc, () => undefined);
    showDropAt(view, 12);
    expect(pageDropCaret.value).toMatchObject({ page: 0 });

    expect(dropMoved(view, 12, false)).toBe(true);
    expect(view.state.doc.textContent).toBe(" worldhello");
    expect(pageDropCaret.value).toBeNull();
    view.destroy();
  });

  it("shows text from another app where it drops, whatever is selected", () => {
    const engine = showPages();
    // a rule selected, whose drop point would be a block boundary
    let state = EditorState.create({
      schema,
      doc: doc(p("hello world"), schema.node("horizontal_rule")),
    });
    state = state.apply(
      state.tr.setSelection(NodeSelection.create(state.doc, 13)),
    );
    const view = new EditorView(document.createElement("div"), { state });
    engine.setSettings(testLayout(), documentFields(view.state.doc));
    engine.sync(view.state.doc, () => undefined);
    showDropAt(view, 4, false);
    expect(pageDropCaret.value).toEqual(engine.caret(4));
    view.destroy();
  });

  it("puts text dropped from another app where it's dropped", () => {
    // what ProseMirror's paste makes, which jsdom lacks
    vi.stubGlobal("ClipboardEvent", class extends Event {});
    const view = new EditorView(document.createElement("div"), {
      state: EditorState.create({ schema, doc: doc(p("hello world")) }),
    });
    const data = (types: Record<string, string>) => ({
      getData: (type: string) => types[type] ?? "",
    });

    expect(dropExternal(view, 6, data({ "text/plain": " there" }))).toBe(true);
    expect(view.state.doc.textContent).toBe("hello there world");

    expect(
      dropExternal(view, 1, data({ "text/html": "<strong>Oh!</strong>" })),
    ).toBe(true);
    expect(view.state.doc.textContent).toBe("Oh!hello there world");
    expect(view.state.doc.firstChild!.firstChild!.marks[0].type.name).toBe(
      "strong",
    );

    expect(dropExternal(view, 1, data({}))).toBe(false);
    view.destroy();
  });
});
