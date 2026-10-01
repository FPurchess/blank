import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextTick, watch } from "vue";

import { setPageEngine } from "../engine/engine";
import { frameLayout } from "../engine/frames";
import { documentFields } from "../layout/bands";
import {
  bandEditor,
  contextMenu,
  pageCaret,
  pageHeadBox,
  pageLayoutState,
  pageScrollRequest,
  pageView,
  pageSelection,
  pageViewport,
} from "../state";
import { EditorView } from "prosemirror-view";

import { createEditorHandle } from "../editor/handle";
import { PAGE_PRESS } from "../editor/pagePointer";
import { contextMenuPlugin } from "../editor/plugins/contextMenu";
import { createState, createTestHandle, doc, h, p } from "../test/editor";
import { testEngine } from "../test/engine";
import { testLayout } from "../test/layout";
import { bootApp } from "./mount";
import { viewAnchor } from "./pageViewModel";
import { alignHiddenEditor } from "../editor/hidden";

vi.mock("../editor/hidden", () => ({ alignHiddenEditor: vi.fn() }));

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
    pageScrollRequest.value = null;
    pageHeadBox.value = null;
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
    // on whole device pixels
    const ratio = window.devicePixelRatio || 1;
    expect(Number.isInteger(parseFloat(caret.style.width) * ratio)).toBe(true);
    // with the focus (a test view counts as focused), the page paints the
    // selected text over the selection itself
    expect(view().querySelectorAll(".page-selection")).toHaveLength(0);
    expect(view().querySelectorAll(".page-selected")).toHaveLength(1);
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
    // with Shift too, never the webview's menu with Back and Reload
    const shifted = new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
      shiftKey: true,
      clientX: event.clientX,
      clientY: event.clientY,
    });
    view().dispatchEvent(shifted);
    expect(shifted.defaultPrevented).toBe(true);
    expect(contextMenu.value).not.toBeNull();
    contextMenu.value = null;
    editor.destroy();
  });

  it("keeps the selection when a band in it is pressed", async () => {
    layOut();
    pageView.value = "pages";
    const handle = createTestHandle(createState(node, { cursor: [2, 4000] }));
    dispose = bootApp(handle);
    await nextTick();
    const band = view().querySelector<HTMLElement>(".page-band.footer")!;
    // the pointer's events, then the mouse's, as the webview sends them
    for (const type of ["pointerdown", "mousedown", "pointerup", "click"])
      band.dispatchEvent(
        new MouseEvent(type, {
          bubbles: true,
          cancelable: true,
          button: 0,
          detail: 1,
          // where the pointer hits the selected text
          clientX: 300,
          clientY: 300,
        }),
      );
    expect(handle.view.state.selection.from).toBe(2);
    expect(handle.view.state.selection.to).toBe(4000);
    bandEditor.value = null;
  });

  it("opens the strip of a band double-clicked on a sheet or where a page ends", async () => {
    layOut();
    const editor = new EditorView(document.createElement("div"), {
      state: createState(node, { cursor: 3 }),
    });
    dispose = bootApp(createEditorHandle(editor).handle);
    pageView.value = "pages";
    await nextTick();
    const footer = frames()[0].querySelector<HTMLElement>(".page-band.footer")!;
    // a press there reaches the editor's plugins, e.g. to close a picker,
    // and leaves the selection as it is
    const presses: Event[] = [];
    editor.dom.addEventListener(PAGE_PRESS, (event) => presses.push(event));
    footer.dispatchEvent(
      new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        detail: 1,
      }),
    );
    expect(presses).toHaveLength(1);
    expect(editor.state.selection.head).toBe(3);
    // a single click opens nothing, a double click the strip
    footer.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(bandEditor.value).toBeNull();
    footer.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(bandEditor.value).toMatchObject({ band: "footer" });
    bandEditor.value = null;
    pageView.value = "page-ends";
    await nextTick();
    frames()[0]
      .querySelector<HTMLElement>(".page-end .band.header")!
      .dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(bandEditor.value).toMatchObject({ band: "header" });
    bandEditor.value = null;
    editor.destroy();
  });

  it("measures a scroll once a frame, and leaves the hidden editor alone", async () => {
    vi.useFakeTimers({ toFake: ["requestAnimationFrame", "setTimeout"] });
    layOut();
    dispose = bootApp(createTestHandle(createState(node, { cursor: 3 })));
    await nextTick();
    vi.runAllTimers();
    vi.mocked(alignHiddenEditor).mockClear();
    const writes: unknown[] = [];
    const stop = watch(pageViewport, (value) => writes.push(value), {
      flush: "sync",
    });
    for (const top of [100, 200, 300]) {
      view().scrollTop = top;
      view().dispatchEvent(new Event("scroll"));
    }
    // nothing yet, then one write for the frame
    expect(writes).toHaveLength(0);
    vi.advanceTimersToNextFrame();
    expect(writes).toHaveLength(1);
    expect(pageViewport.value?.scrollTop).toBe(300);
    // a frame without a scroll writes nothing
    vi.advanceTimersToNextFrame();
    expect(writes).toHaveLength(1);
    // scrolling doesn't move the hidden editor, which makes the webview lay
    // it out again
    vi.advanceTimersByTime(1000);
    expect(alignHiddenEditor).not.toHaveBeenCalled();
    stop();
    vi.useRealTimers();
  });

  it("shows the header of a one-page document above its text", async () => {
    const short = doc(p("One page."));
    const engine = testEngine();
    const header = { left: "Head", center: "", right: "Page {page}" };
    engine.setSettings(testLayout({ header }), documentFields(short));
    engine.sync(short, () => undefined);
    setPageEngine(engine);
    pageLayoutState.value = {
      width: 595.28,
      height: 841.89,
      margins: { top: 70.87, right: 70.87, bottom: 70.87, left: 70.87 },
      pages: engine.pages(),
      versions: engine.raw.versions(),
      bottoms: engine.raw.bottoms(),
      header: true,
    };
    dispose = bootApp(createTestHandle(createState(short, { cursor: 1 })));
    await nextTick();
    const shown = view().querySelector<HTMLElement>(".page-first-header")!;
    expect([...shown.children].map((slot) => slot.textContent)).toEqual([
      "Head",
      "",
      "Page 1",
    ]);
    // above the text of the first page
    expect(parseFloat(shown.style.top)).toBeLessThan(
      parseFloat(frames()[0].style.top),
    );
    // typing doesn't read the header again, only a change of the first
    // page's header and footer does
    const bands = vi.spyOn(engine, "bands");
    pageLayoutState.value = { ...pageLayoutState.value! };
    await nextTick();
    expect(bands).not.toHaveBeenCalled();
    pageLayoutState.value = {
      ...pageLayoutState.value!,
      bandVersions: new Uint32Array([999]),
    };
    await nextTick();
    expect(bands).toHaveBeenCalledWith(0);
    bands.mockRestore();
    // the sheets show it themselves
    pageView.value = "pages";
    await nextTick();
    expect(view().querySelector(".page-first-header")).toBeNull();
    // a plain first page has none
    pageView.value = "page-ends";
    engine.setSettings(
      testLayout({ header, firstPage: "plain" }),
      documentFields(short),
    );
    pageLayoutState.value = {
      ...pageLayoutState.value,
      versions: engine.raw.versions(),
      header: false,
    };
    await nextTick();
    expect(view().querySelector(".page-first-header")).toBeNull();
  });

  // lays out `content` with `settings`, as the editor's plugin publishes it
  const layOutWith = (
    content: typeof node,
    settings: Parameters<typeof testLayout>[0],
  ) => {
    const engine = pageEngineFor(content, settings);
    const pages = engine.pages();
    pageLayoutState.value = {
      width: 595.28,
      height: 841.89,
      margins: { top: 70.87, right: 70.87, bottom: 70.87, left: 70.87 },
      pages,
      versions: engine.raw.versions(),
      bandVersions: engine.raw.bandVersions(),
      bottoms: engine.raw.bottoms(),
      header: engine.bands(0).slice(0, 3).some(Boolean),
      footer: engine
        .bands(pages - 1)
        .slice(3, 6)
        .some(Boolean),
    };
    return engine;
  };
  const pageEngineFor = (
    content: typeof node,
    settings: Parameters<typeof testLayout>[0],
  ) => {
    const engine = testEngine();
    engine.setSettings(testLayout(settings), documentFields(content));
    engine.sync(content, () => undefined);
    setPageEngine(engine);
    return engine;
  };
  const lastFooter = () =>
    view().querySelector<HTMLElement>(".page-last-footer");
  const slotsOf = (element: HTMLElement | null) =>
    element ? [...element.children].map((slot) => slot.textContent) : null;

  it("ends the last page without a mark, an empty one with nothing at all", async () => {
    const empty = doc(p(""));
    layOutWith(empty, {});
    dispose = bootApp(createTestHandle(createState(empty, { cursor: 1 })));
    await nextTick();
    expect(frames()).toHaveLength(1);
    expect(view().querySelector(".page-end")).toBeNull();
    expect(lastFooter()).toBeNull();
    // the desk ends a little below the text
    const layout = shown("page-ends");
    const last = layout.frames[0];
    expect(layout.height - (last.top + last.height)).toBeLessThan(80);
  });

  it("shows the last page's footer below its text, where a mark would show it", async () => {
    const footer = { left: "Foot", center: "", right: "{page}" };
    const one = doc(p("One page."));
    layOutWith(one, { footer });
    const editor = new EditorView(document.createElement("div"), {
      state: createState(one, { cursor: 1 }),
    });
    dispose = bootApp(createEditorHandle(editor).handle);
    await nextTick();
    expect(view().querySelector(".page-end")).toBeNull();
    expect(slotsOf(lastFooter())).toEqual(["Foot", "", "1"]);
    // right below the text of the page, with room for it on the desk
    const frame = frames()[0];
    expect(parseFloat(lastFooter()!.style.top)).toBe(
      parseFloat(frame.style.top) + parseFloat(frame.style.height),
    );
    const layout = shown("page-ends");
    expect(layout.footerRoom).toBeGreaterThan(0);
    // a double click opens the footer's strip
    lastFooter()!.dispatchEvent(new MouseEvent("dblclick", { bubbles: true }));
    expect(bandEditor.value).toMatchObject({ band: "footer" });
    bandEditor.value = null;
    // the sheets show it themselves
    pageView.value = "pages";
    await nextTick();
    expect(lastFooter()).toBeNull();
    pageView.value = "page-ends";
    // a plain first page, the only one, has none
    layOutWith(one, { footer, firstPage: "plain" });
    await nextTick();
    expect(lastFooter()).toBeNull();
    expect(view().querySelector(".page-end")).toBeNull();
    editor.destroy();
  });

  it("shows the mark between two pages, and the last one's own footer below", async () => {
    const footer = { left: "Odd", center: "", right: "" };
    const evenPages = {
      header: { left: "", center: "", right: "" },
      footer: { left: "Even", center: "", right: "" },
    };
    // two pages
    const two = doc(...Array.from({ length: 18 }, () => p(LONG)));
    layOutWith(two, { footer, evenPages });
    dispose = bootApp(createTestHandle(createState(two, { cursor: 3 })));
    await nextTick();
    // the last page is the second, an even one
    expect(pageLayoutState.value!.pages).toBe(2);
    const marks = view().querySelectorAll(".page-end");
    expect(marks.length).toBe(pageLayoutState.value!.pages - 1);
    const all = frames();
    expect(all[0].querySelector(".page-end")).not.toBeNull();
    expect(all[all.length - 1].querySelector(".page-end")).toBeNull();
    expect(slotsOf(lastFooter())).toEqual(["Even", "", ""]);
    expect(
      slotsOf(all[0].querySelector<HTMLElement>(".page-end .band.footer")),
    ).toEqual(["Odd", "", ""]);
  });

  // the layout the view shows in `mode`, at jsdom's window width
  const shown = (mode: "page-ends" | "pages") =>
    frameLayout(pageLayoutState.value!, mode, window.innerWidth);

  it("keeps the page at the top of the view when it switches", async () => {
    layOut();
    dispose = bootApp(createTestHandle(createState(node, { cursor: 3 })));
    await nextTick();
    // a request from typing on the first page, served and gone
    pageScrollRequest.value = { page: 0, x: 80, y: 100, width: 0, height: 16 };
    await nextTick();
    expect(pageScrollRequest.value).toBeNull();
    // then scrolled far from it, a bit into the third page
    const third = shown("page-ends").frames[2];
    view().scrollTop = third.top + 30;
    const before = viewAnchor(shown("page-ends"), view().scrollTop)!;
    expect(before.page).toBe(2);
    pageView.value = "pages";
    await nextTick();
    // the first render after the switch already shows the third page
    expect(frames().map((frame) => frame.dataset.page)).toContain("3");
    await nextTick();
    const after = viewAnchor(shown("pages"), view().scrollTop)!;
    expect(after.page).toBe(2);
    expect(after.y).toBeCloseTo(before.y, 0);
    // and back
    pageView.value = "page-ends";
    await nextTick();
    await nextTick();
    expect(viewAnchor(shown("page-ends"), view().scrollTop)).toMatchObject({
      page: 2,
    });
  });

  it("keeps the place when the first page gets room for its header", async () => {
    layOut();
    dispose = bootApp(createTestHandle(createState(node, { cursor: 3 })));
    await nextTick();
    const third = shown("page-ends").frames[2];
    view().scrollTop = third.top + 30;
    const before = viewAnchor(shown("page-ends"), view().scrollTop)!;
    // a header typed into the first page: 20 px more above it
    pageLayoutState.value = { ...pageLayoutState.value!, header: true };
    await nextTick();
    await nextTick();
    const after = viewAnchor(shown("page-ends"), view().scrollTop)!;
    expect(after.page).toBe(2);
    expect(after.y).toBeCloseTo(before.y, 0);
  });

  it("keeps the place when a resize shows the pages at another scale", async () => {
    layOut();
    dispose = bootApp(createTestHandle(createState(node, { cursor: 3 })));
    await nextTick();
    const third = shown("page-ends").frames[2];
    view().scrollTop = third.top + 30;
    const before = viewAnchor(shown("page-ends"), view().scrollTop)!;
    const width = window.innerWidth;
    try {
      window.innerWidth = 500;
      window.dispatchEvent(new Event("resize"));
      await nextTick();
      await nextTick();
      expect(shown("page-ends").scale).not.toBe(
        frameLayout(pageLayoutState.value!, "page-ends", width).scale,
      );
      const after = viewAnchor(shown("page-ends"), view().scrollTop)!;
      expect(after.page).toBe(2);
      expect(after.y).toBeCloseTo(before.y, 0);
    } finally {
      window.innerWidth = width;
    }
  });

  it("aligns the input method where the selection's head is painted", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout"] });
    layOut();
    // a range whose head is on the second page, at the end of a line the
    // plugin publishes with its affinity
    dispose = bootApp(
      createTestHandle(createState(node, { cursor: [10, 200] })),
    );
    pageCaret.value = null;
    pageSelection.value = [{ page: 1, x: 80, y: 90, width: 50, height: 16 }];
    await nextTick();
    vi.mocked(alignHiddenEditor).mockClear();
    const head = { page: 1, x: 200, y: 120, width: 0, height: 16 };
    pageHeadBox.value = head;
    await nextTick();
    vi.advanceTimersByTime(200);
    expect(alignHiddenEditor).toHaveBeenCalled();
    const [, x, y] =
      vi.mocked(alignHiddenEditor).mock.calls[
        vi.mocked(alignHiddenEditor).mock.calls.length - 1
      ];
    const layout = shown("page-ends");
    const frame = layout.frames[1];
    expect(y).toBeCloseTo(frame.top + (head.y - frame.y) * layout.scale, 0);
    expect(x).toBeCloseTo(frame.left + (head.x - frame.x) * layout.scale, 0);
    vi.useRealTimers();
  });

  it("shows the page of the caret in the bottom bar", async () => {
    layOut();
    dispose = bootApp(createTestHandle(createState(node, { cursor: 3 })));
    pageCaret.value = { page: 1, x: 100, y: 100, width: 0, height: 20 };
    await nextTick();
    const status = document.getElementById("ui-page-number")!;
    expect(status.textContent!.trim()).toMatch(/^Page 2 of \d+$/);
    // screen readers are told the page, as they read the text, not the
    // pages, in a live region that stays, and not how many there are
    const spoken = document.getElementById("ui-page-spoken")!;
    expect(spoken.getAttribute("role")).toBe("status");
    expect(spoken.textContent!.trim()).toBe("Page 2");
    pageLayoutState.value = {
      ...pageLayoutState.value!,
      pages: pageLayoutState.value!.pages + 1,
    };
    await nextTick();
    expect(document.getElementById("ui-page-spoken")).toBe(spoken);
    expect(spoken.textContent!.trim()).toBe("Page 2");
  });
});
