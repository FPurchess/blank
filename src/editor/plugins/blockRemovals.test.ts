import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Node } from "prosemirror-model";
import { EditorState, NodeSelection, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { deleteSelection } from "prosemirror-commands";
import { history, undo } from "prosemirror-history";

import { createForm, schema } from "../../markdown";
import { announcement } from "../../state";
import { doc, p } from "../../test/editor";
import { RECIPE, RECIPE_KEY } from "../../test/forms";
import { pageDrop } from "../commands/pageDrop";
import { blockRemovals, removedMessage } from "./blockRemovals";

let view: EditorView;

const toc = () => schema.node("toc");

const mount = (node: Node) => {
  view = new EditorView(document.createElement("div"), {
    state: EditorState.create({
      doc: node,
      plugins: [history(), blockRemovals()],
    }),
  });
};

const selectNode = (pos: number) =>
  view.dispatch(
    view.state.tr.setSelection(NodeSelection.create(view.state.doc, pos)),
  );

describe("blockRemovals", () => {
  beforeEach(() => (announcement.value = null));
  afterEach(() => view.destroy());

  it("says a block removed with Delete or Backspace is gone", () => {
    mount(doc(p("a"), toc(), p("b")));
    selectNode(3);
    deleteSelection(view.state, view.dispatch);
    expect(view.state.doc.eq(doc(p("a"), p("b")))).toBe(true);
    expect(announcement.value?.text).toBe("Table of contents removed");
  });

  it("names a form by its definition", () => {
    mount(
      schema.node("doc", { definitions: { [RECIPE_KEY]: RECIPE } }, [
        p("a"),
        createForm(RECIPE, RECIPE_KEY),
        p("b"),
      ]),
    );
    selectNode(3);
    deleteSelection(view.state, view.dispatch);
    expect(announcement.value?.text).toBe("Recipe removed");
  });

  it("counts several blocks removed at once", () => {
    mount(doc(p("a"), toc(), toc(), p("b")));
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 2, 7)),
    );
    deleteSelection(view.state, view.dispatch);
    expect(announcement.value?.text).toBe("2 blocks removed");
  });

  it("says nothing about typing, a changed block, a move or undo", () => {
    mount(doc(p("a"), toc(), p("b")));
    view.dispatch(view.state.tr.insertText("x", 1));
    view.dispatch(
      view.state.tr.setNodeMarkup(4, null, { depth: 2, title: "Overview" }),
    );
    expect(view.state.doc.child(1).attrs.title).toBe("Overview");
    selectNode(4);
    const slice = view.state.selection.content();
    pageDrop(slice, view.state.doc.content.size, { from: 4, to: 5 })(
      view.state,
      view.dispatch,
    );
    expect(view.state.doc.child(2).type.name).toBe("toc");
    expect(announcement.value).toBeNull();
    // undoing the insertion of a block removes it without a word
    mount(doc(p("a"), p("b")));
    view.dispatch(view.state.tr.insert(3, toc()));
    undo(view.state, view.dispatch);
    expect(view.state.doc.childCount).toBe(2);
    expect(announcement.value).toBeNull();
  });

  it("says nothing about the repairs another plugin appends", () => {
    mount(doc(p("a"), toc(), p("b")));
    selectNode(3);
    deleteSelection(view.state, view.dispatch);
    announcement.value = null;
    view.dispatch(
      view.state.tr.insertText("y", 1).setMeta("addToHistory", false),
    );
    expect(announcement.value).toBeNull();
  });
});

describe("removedMessage", () => {
  it("names one block, and counts more", () => {
    expect(removedMessage(["Recipe"])).toBe("Recipe removed");
    expect(removedMessage(["Recipe", "Table of contents"])).toBe(
      "2 blocks removed",
    );
  });
});
