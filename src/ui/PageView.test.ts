import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { nextTick } from "vue";

import { setPageEngine } from "../engine/engine";
import { documentFields } from "../layout/bands";
import {
  bandEditor,
  contextMenu,
  pageCaret,
  pageLayoutState,
  pageView,
  pageSelection,
} from "../state";
import { EditorView } from "prosemirror-view";

import { createEditorHandle } from "../editor/handle";
import { contextMenuPlugin } from "../editor/plugins/contextMenu";
import { createState, createTestHandle, doc, h, p } from "../test/editor";
import { testEngine } from "../test/engine";
import { testLayout } from "../test/layout";
import { bootApp } from "./mount";

const LONG =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua.";

const node = doc(h(1, "Title"), ...Array.from({ length: 40 }, () => p(LONG)));

const view = () => document.getElementById("page-view")!;
const frames = () => [...view().querySelectorAll<HTMLElement>(".page-frame")];

// the engine lays out the document, as the editor's plugin does
const layOut = () => {
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
  return engine;
};

describe("page view", () => {
  let dispose = () => {};

  beforeEach(() => {
    document.body.innerHTML = '<div id="ui-bottom"></div>';
  });

  afterEach(() => {
    dispose();
    setPageEngine(null);
    pageLayoutState.value = null;
    pageCaret.value = null;
    pageSelection.value = [];
    pageView.value = "page-ends";
    document.body.replaceChildren();
  });

  it("shows the pages near the view, in either view", async () => {
    const engine = layOut();
    const handle = createTestHandle(createState(node, { cursor: 3 }));
    dispose = bootApp(handle);
    await nextTick();
    expect(view().classList.contains("page-ends")).toBe(true);
    // screen readers read the editor behind it
    expect(view().getAttribute("aria-hidden")).toBe("true");
    expect(frames().length).toBeGreaterThan(0);
    expect(frames().length).toBeLessThanOrEqual(engine.pages());
    expect(frames()[0].querySelector(".page-end")).not.toBeNull();
    pageView.value = "pages";
    await nextTick();
    expect(view().classList.contains("pages")).toBe(true);
    expect(frames()[0].classList.contains("sheet")).toBe(true);
    expect(frames()[0].querySelector(".page-end")).toBeNull();
  });

  it("paints the caret and the selection where the engine puts them", async () => {
    layOut();
    dispose = bootApp(createTestHandle(createState(node, { cursor: 3 })));
    pageCaret.value = { page: 0, x: 100, y: 100, width: 0, height: 20 };
    pageSelection.value = [{ page: 0, x: 80, y: 90, width: 50, height: 16 }];
    await nextTick();
    const caret = view().querySelector<HTMLElement>(".page-caret")!;
    expect(parseFloat(caret.style.height)).toBeGreaterThan(20);
    expect(view().querySelectorAll(".page-selection")).toHaveLength(1);
  });

  it("places the caret where it is clicked", async () => {
    const engine = layOut();
    const handle = createTestHandle(createState(node, { cursor: 3 }));
    dispose = bootApp(handle);
    await nextTick();
    const frame = frames()[0];
    const top = parseFloat(frame.style.top);
    const left = parseFloat(frame.style.left);
    // on the first paragraph's line, left of the text
    const caret = engine.caret(10)!;
    const scale = parseFloat(frame.style.width) / (595.28 - 2 * 70.87 + 48);
    view().dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        detail: 1,
        clientX: left + 2,
        clientY: top + (caret.y - 70.87 + caret.height / 2) * scale,
      }),
    );
    expect(handle.view.state.selection.head).toBe(8);
    // a double click selects the word
    view().dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        button: 0,
        detail: 2,
        clientX: left + (caret.x - 70.87 + 24) * scale,
        clientY: top + (caret.y - 70.87 + caret.height / 2) * scale,
      }),
    );
    expect(handle.view.state.selection.empty).toBe(false);
  });

  it("opens the context menu on a right click, where it hits", async () => {
    const engine = layOut();
    const editor = new EditorView(document.createElement("div"), {
      state: createState(node, { cursor: 3, plugins: [contextMenuPlugin()] }),
    });
    dispose = bootApp(createEditorHandle(editor).handle);
    await nextTick();
    const frame = frames()[0];
    const top = parseFloat(frame.style.top);
    const left = parseFloat(frame.style.left);
    const caret = engine.caret(20)!;
    const scale = parseFloat(frame.style.width) / (595.28 - 2 * 70.87 + 48);
    const event = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: left + (caret.x - 70.87 + 24) * scale,
      clientY: top + (caret.y - 70.87 + caret.height / 2) * scale,
    });
    view().dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
    expect(contextMenu.value?.anchor.left).toBe(event.clientX);
    // the caret went where the click was
    expect(Math.abs(editor.state.selection.head - 20)).toBeLessThan(2);
    contextMenu.value = null;
    editor.destroy();
  });

  it("opens the strip of a band clicked on a sheet or where a page ends", async () => {
    layOut();
    const editor = new EditorView(document.createElement("div"), {
      state: createState(node, { cursor: 3 }),
    });
    dispose = bootApp(createEditorHandle(editor).handle);
    pageView.value = "pages";
    await nextTick();
    frames()[0]
      .querySelector<HTMLElement>(".page-band.footer")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(bandEditor.value).toMatchObject({ band: "footer" });
    bandEditor.value = null;
    pageView.value = "page-ends";
    await nextTick();
    frames()[0]
      .querySelector<HTMLElement>(".page-end .band.header")!
      .dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(bandEditor.value).toMatchObject({ band: "header" });
    bandEditor.value = null;
    editor.destroy();
  });

  it("shows the page of the caret in the bottom bar", async () => {
    layOut();
    dispose = bootApp(createTestHandle(createState(node, { cursor: 3 })));
    pageCaret.value = { page: 1, x: 100, y: 100, width: 0, height: 20 };
    await nextTick();
    expect(
      document.getElementById("ui-page-number")!.textContent!.trim(),
    ).toMatch(/^Page 2 of \d+$/);
  });
});
