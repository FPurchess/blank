import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";
import { EditorView } from "prosemirror-view";

import { createEditorHandle } from "../editor/handle";
import { setPageEngine } from "../engine/engine";
import { documentFields } from "../layout/bands";
import {
  pageCaret,
  pageDropCaret,
  pageLayoutState,
  pageSelection,
} from "../state";
import { createState, doc, p } from "../test/editor";
import { testEngine } from "../test/engine";
import { testLayout } from "../test/layout";
import { bootApp } from "./mount";

// The caret and the selection over the pages: the caret shows while the
// editor has the focus, and the selection dims without it, as the webview's
// own text does.

const node = doc(p("Some text to select on the first page."));

describe("the caret and the selection on the pages", () => {
  let dispose = () => {};
  let editor: EditorView;

  beforeEach(() => {
    document.body.innerHTML = '<div id="ui-bottom"></div>';
    const engine = testEngine();
    engine.setSettings(testLayout(), documentFields(node));
    engine.sync(node, () => undefined);
    setPageEngine(engine);
    pageLayoutState.value = {
      width: 595.28,
      height: 841.89,
      margins: { top: 70.87, right: 70.87, bottom: 70.87, left: 70.87 },
      pages: engine.pages(),
      versions: engine.raw.versions(),
      bottoms: engine.raw.bottoms(),
    };
    editor = new EditorView(
      document.body.appendChild(document.createElement("div")),
      {
        state: createState(node, { cursor: 3 }),
      },
    );
    dispose = bootApp(createEditorHandle(editor).handle);
  });

  afterEach(() => {
    dispose();
    editor.destroy();
    setPageEngine(null);
    pageLayoutState.value = null;
    pageCaret.value = null;
    pageDropCaret.value = null;
    pageSelection.value = [];
    document.body.replaceChildren();
  });

  const view = () => document.getElementById("page-view")!;

  it("shows the caret only while the editor has the focus", async () => {
    pageCaret.value = { page: 0, x: 100, y: 100, width: 0, height: 16 };
    editor.dom.dispatchEvent(new FocusEvent("focus"));
    await nextTick();
    expect(view().querySelector(".page-caret")).not.toBeNull();
    editor.dom.dispatchEvent(new FocusEvent("blur"));
    await nextTick();
    expect(view().querySelector(".page-caret")).toBeNull();
  });

  it("dims the selection while the editor hasn't the focus", async () => {
    pageSelection.value = [{ page: 0, x: 80, y: 90, width: 50, height: 16 }];
    editor.dom.dispatchEvent(new FocusEvent("focus"));
    await nextTick();
    const selected = () => view().querySelector(".page-selection")!;
    expect(selected().classList.contains("inactive")).toBe(false);
    editor.dom.dispatchEvent(new FocusEvent("blur"));
    await nextTick();
    expect(selected().classList.contains("inactive")).toBe(true);
    // under the pages' text: before the frames, which paint over it
    const frame = view().querySelector(".page-frame")!;
    expect(
      selected().compareDocumentPosition(frame) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("shows where dragged text would drop, focused or not", async () => {
    pageDropCaret.value = { page: 0, x: 120, y: 100, width: 0, height: 16 };
    editor.dom.dispatchEvent(new FocusEvent("blur"));
    await nextTick();
    expect(view().querySelector(".page-drop-caret")).not.toBeNull();
    pageDropCaret.value = null;
    await nextTick();
    expect(view().querySelector(".page-drop-caret")).toBeNull();
  });
});
