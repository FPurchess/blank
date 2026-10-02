import { afterEach, describe, expect, it } from "vitest";
import { EditorState, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";

import { schema } from "../../markdown";
import { headings } from "../../state";
import { doc, h, p, table, td, th, tr } from "../../test/editor";
import { applyDocument } from "../document";
import { headings as headingsPlugin } from "./headings";
import { tableGuard } from "./tables";

let view: EditorView | null = null;

const mount = (node = doc(h(1, "One"), p("text"), h(2, "Two"))) => {
  view = new EditorView(
    document.body.appendChild(document.createElement("div")),
    {
      state: EditorState.create({
        schema,
        doc: node,
        plugins: [headingsPlugin(), tableGuard()],
      }),
    },
  );
  return view;
};

const texts = () => headings.value.map((heading) => heading.text);

afterEach(() => {
  view?.destroy();
  view = null;
  headings.value = [];
  document.body.innerHTML = "";
});

describe("the headings plugin", () => {
  it("publishes the headings of the document it starts with", () => {
    mount();
    expect(texts()).toEqual(["One", "Two"]);
  });

  it("publishes them again after a change", () => {
    const editor = mount();
    editor.dispatch(editor.state.tr.insertText("!", 4));
    expect(texts()).toEqual(["One!", "Two"]);
  });

  it("publishes nothing new when only the selection moves", () => {
    const editor = mount();
    const before = headings.value;
    editor.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 2)),
    );
    expect(headings.value).toBe(before);
  });

  it("publishes the document as the plugins left it", () => {
    const editor = mount(doc(h(1, "One")));
    // a table at the start gets a paragraph before it from the table guard,
    // which moves the heading
    const small = table(tr(th("a")), tr(td("b")));
    editor.dispatch(editor.state.tr.insert(0, small));
    const { doc: now } = editor.state;
    expect(now.lastChild!.type.name).toBe("heading");
    const pos = now.content.size - now.lastChild!.nodeSize;
    expect(headings.value).toEqual([{ level: 1, text: "One", pos }]);
    expect(editor.state.doc.firstChild!.type.name).toBe("paragraph");
  });

  it("publishes the headings of a document that is opened", () => {
    const editor = mount();
    editor.updateState(applyDocument(editor.state, doc(h(3, "Opened"))));
    expect(headings.value).toEqual([{ level: 3, text: "Opened", pos: 0 }]);
  });
});
