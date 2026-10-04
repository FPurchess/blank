import {
  joinBackward,
  lift,
  splitBlock,
  toggleMark,
  wrapIn,
} from "prosemirror-commands";
import { history, redo, undo } from "prosemirror-history";
import { sinkListItem, wrapInList } from "prosemirror-schema-list";
import {
  type Command,
  EditorState,
  NodeSelection,
  Plugin as PluginClass,
  type Plugin,
  Selection,
  TextSelection,
} from "prosemirror-state";
import { CellSelection, tableEditing, TableMap } from "prosemirror-tables";
import { EditorView } from "prosemirror-view";
import { sendNotification } from "@tauri-apps/plugin-notification";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { schema } from "../../markdown";
import {
  engineMissing,
  pageFields,
  pageHeadBox,
  pageLayout,
  path,
  transaction,
  pageCaret,
  pageComposition,
  pageLayoutState,
  pageNodeSelection,
  pageScrollRequest,
  pageSelection,
} from "../../state";
import {
  blockquote,
  doc,
  docWithFrontmatter,
  h,
  li,
  ul,
  keyEvent,
  p,
  table,
  td,
  tr,
} from "../../test/editor";
import {
  ENGINE_FAILED,
  forgetEngineFailure,
  pageEngine,
} from "../../engine/engine";
import { hidePages, pageOf, showPages, testEngine } from "../../test/engine";
import { random } from "../../test/random";
import { caretBox } from "../../engine/geometry";
import { forgetImages, loadedImages } from "../../engine/images";
import { perfSamples } from "../../engine/perf";
import { pageSelect, pageSelectRange } from "../commands/pageSelect";
import { pageSync, pageView, pageViewKey, selectionAt } from "./pageView";
import { applyDocument } from "../document";
import * as flattening from "../../engine/flatten";
import { tableGrid } from "../../exporters/table";

const LONG =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.";

// an editor with the page view's plugins, on the pages the app shows
const mount = (node = doc(p(LONG), p(LONG)), plugins: Plugin[] = []) => {
  let state = EditorState.create({
    schema,
    doc: node,
    plugins: [pageSync(), pageView(), ...plugins],
  });
  state = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, 5)),
  );
  const view = new EditorView(document.createElement("div"), { state });
  const press = (combo: string) =>
    view.someProp("handleKeyDown", (f) => f(view, keyEvent(combo))) ?? false;
  return { view, press, pluginView: { destroy: () => view.destroy() } };
};

describe("pageView plugin", () => {
  let destroy = () => {};

  beforeEach(() => showPages());
  afterEach(() => {
    destroy();
    hidePages();
    pageScrollRequest.value = null;
  });

  it("publishes the pages and the caret", () => {
    const mounted = mount();
    destroy = () => mounted.pluginView.destroy?.();
    expect(pageLayoutState.value?.pages).toBe(1);
    expect(pageCaret.value).toMatchObject({ page: 0 });
    mounted.view.dispatch(mounted.view.state.tr.insertText("typed ", 1));
    expect(pageCaret.value).not.toBeNull();
    // typing asks the view to show the caret
    expect(pageScrollRequest.value).not.toBeNull();
    mounted.view.dispatch(
      mounted.view.state.tr.setSelection(
        TextSelection.create(mounted.view.state.doc, 1, 30),
      ),
    );
    expect(pageCaret.value).toBeNull();
    expect(pageSelection.value.length).toBeGreaterThan(0);
  });

  it("moves up and down by the painted lines, keeping the column", () => {
    const mounted = mount();
    destroy = () => mounted.pluginView.destroy?.();
    const start = pageCaret.value!;
    expect(mounted.press("ArrowDown")).toBe(true);
    const down = pageCaret.value!;
    expect(down.y).toBeGreaterThan(start.y);
    expect(Math.abs(down.x - start.x)).toBeLessThan(8);
    expect(mounted.press("ArrowUp")).toBe(true);
    expect(mounted.view.state.selection.head).toBe(5);
    // with Shift, it selects
    mounted.press("Shift-ArrowDown");
    expect(mounted.view.state.selection.anchor).toBe(5);
    expect(mounted.view.state.selection.empty).toBe(false);
    // from the first line up to the start
    mounted.view.dispatch(
      mounted.view.state.tr.setSelection(
        TextSelection.create(mounted.view.state.doc, 5),
      ),
    );
    mounted.press("ArrowUp");
    expect(mounted.view.state.selection.head).toBe(0 + 1);
    // leaves modified keys alone
    expect(mounted.press("Mod-ArrowDown")).toBe(false);
  });

  it("goes to the start and end of the painted line", () => {
    const mounted = mount();
    destroy = () => mounted.pluginView.destroy?.();
    mounted.press("End");
    const end = mounted.view.state.selection.head;
    expect(end).toBeGreaterThan(20);
    expect(end).toBeLessThan(LONG.length);
    mounted.press("Home");
    expect(mounted.view.state.selection.head).toBe(1);
  });

  it("keeps the column of ↑ and ↓ for Page Down", () => {
    // lines alike, so every line has the same caret positions
    const mounted = mount(
      doc(...Array.from({ length: 80 }, () => p("abcdefghij klmnopqrst"))),
    );
    destroy = () => mounted.pluginView.destroy?.();
    const start = pageCaret.value!;
    mounted.press("ArrowDown");
    expect(pageCaret.value!.x).toBeCloseTo(start.x, 3);
    const before = mounted.view.state.selection.head;
    expect(mounted.press("PageDown")).toBe(true);
    expect(mounted.view.state.selection.head).toBeGreaterThan(before + 100);
    // within a pixel of the page view, in points
    const scale = 18 / 11;
    expect(Math.abs(pageCaret.value!.x - start.x) * scale).toBeLessThan(1);
    mounted.press("PageUp");
    expect(Math.abs(pageCaret.value!.x - start.x) * scale).toBeLessThan(1);
  });

  it("keeps the column of ↑ and ↓ for Page Down past a shorter line", () => {
    // a long line, short ones, then long ones a view's height below
    const line = "abcdefghij klmnopqrst uvwxyz";
    const mounted = mount(
      doc(
        p(line),
        ...Array.from({ length: 3 }, () => p("ab")),
        ...Array.from({ length: 80 }, () => p(line)),
      ),
    );
    destroy = () => mounted.pluginView.destroy?.();
    mounted.view.dispatch(
      mounted.view.state.tr.setSelection(
        TextSelection.create(mounted.view.state.doc, 21),
      ),
    );
    const start = pageCaret.value!;
    // onto a short line, whose end is left of the column
    mounted.press("ArrowDown");
    expect(pageCaret.value!.x).toBeLessThan(start.x - 20);
    expect(mounted.press("PageDown")).toBe(true);
    // back at the column on the long lines below, within a pixel
    const scale = 18 / 11;
    expect(
      mounted.view.state.doc.resolve(mounted.view.state.selection.head).parent
        .textContent,
    ).toBe(line);
    expect(Math.abs(pageCaret.value!.x - start.x) * scale).toBeLessThan(1);
  });

  it("moves a view's height with Page Up and Down, keeping its place", () => {
    const mounted = mount(doc(...Array.from({ length: 30 }, () => p(LONG))));
    destroy = () => mounted.pluginView.destroy?.();
    const start = caretBox(5)!;
    expect(mounted.press("PageDown")).toBe(true);
    const head = mounted.view.state.selection.head;
    const moved = caretBox(head)!;
    // most of the 600 px view further down, in the same column
    expect(moved.top - start.top).toBeGreaterThan(400);
    expect(moved.top - start.top).toBeLessThan(600);
    expect(Math.abs(moved.left - start.left)).toBeLessThan(10);
    // the view scrolls as far, so the caret stays where it was in it
    expect(pageScrollRequest.value?.at).toBeCloseTo(start.top, 0);
    mounted.press("PageUp");
    expect(mounted.view.state.selection.head).toBe(5);
    // up from the top goes to the start
    mounted.press("PageUp");
    expect(mounted.view.state.selection.head).toBe(0 + 1);
    // with Shift, it selects
    mounted.press("Shift-PageDown");
    expect(mounted.view.state.selection.empty).toBe(false);
  });

  it("underlines the text being composed", () => {
    const mounted = mount();
    destroy = () => mounted.pluginView.destroy?.();
    const { view } = mounted;
    view.dom.dispatchEvent(new CompositionEvent("compositionstart"));
    view.dispatch(view.state.tr.insertText("にほん"));
    expect(pageComposition.value).toHaveLength(1);
    expect(pageComposition.value[0].width).toBeGreaterThan(0);
    view.dom.dispatchEvent(new CompositionEvent("compositionend"));
    expect(pageComposition.value).toEqual([]);
  });

  it("outlines a selected node instead of selecting text", () => {
    const mounted = mount(
      doc(p("a"), schema.nodes.horizontal_rule.create(), p("b")),
    );
    destroy = () => mounted.pluginView.destroy?.();
    const { view } = mounted;
    view.dispatch(
      view.state.tr.setSelection(NodeSelection.create(view.state.doc, 3)),
    );
    expect(pageNodeSelection.value).toHaveLength(1);
    expect(pageSelection.value).toEqual([]);
    expect(pageCaret.value).toBeNull();
  });

  it("keeps the columns of the table the cursor is in while typing", () => {
    const mounted = mount(doc(p("x"), table(tr(td("a"), td("b"))), p("after")));
    destroy = () => mounted.pluginView.destroy?.();
    const { view } = mounted;
    const columns = () => pageEngine!.tableGrid(3)!.columns;
    const before = columns();
    // into the first cell, and type a lot there
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 7)),
    );
    view.dispatch(view.state.tr.insertText(" and a much longer text"));
    expect(columns()).toEqual(before);
    // out of the table: the columns follow the text again
    view.dispatch(
      view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)),
    );
    expect(columns()[1]).toBeGreaterThan(before[1]);
  });

  it("selects what the pointer hits, without scrolling", () => {
    const mounted = mount();
    destroy = () => mounted.pluginView.destroy?.();
    pageScrollRequest.value = null;
    pageSelect({ node: false, pos: 10 })(mounted.view.state, (tr) =>
      mounted.view.dispatch(tr),
    );
    expect(mounted.view.state.selection.head).toBe(10);
    expect(pageViewKey.getState(mounted.view.state)?.by).toBe("pointer");
    expect(pageScrollRequest.value).toBeNull();
    pageSelectRange(3, 8)(mounted.view.state, (tr) =>
      mounted.view.dispatch(tr),
    );
    expect(mounted.view.state.selection).toMatchObject({ from: 3, to: 8 });
  });
});

describe("selectionAt", () => {
  it("selects a node the pointer hits", () => {
    const node = doc(p("a"), schema.nodes.page_break.create(), p("b"));
    const state = EditorState.create({ schema, doc: node });
    expect(selectionAt(state, { node: true, pos: 3 })).toBeInstanceOf(
      NodeSelection,
    );
    expect(selectionAt(state, { node: false, pos: 99 }).head).toBe(
      node.content.size - 1,
    );
  });
});

describe("an engine that fails", () => {
  const trap = () => {
    throw new WebAssembly.RuntimeError("unreachable");
  };
  let destroy = () => {};

  beforeEach(() => {
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    destroy();
    destroy = () => {};
    hidePages();
    forgetEngineFailure();
  });

  it("lets editing go on without the pages, and tells the user once", () => {
    const engine = showPages();
    const mounted = mount();
    destroy = () => mounted.view.destroy();
    vi.spyOn(engine.raw, "update").mockImplementation(trap);

    mounted.view.dispatch(mounted.view.state.tr.insertText("a", 1));
    mounted.view.dispatch(mounted.view.state.tr.insertText("b", 1));

    expect(mounted.view.state.doc.firstChild!.textContent).toMatch(/^baLorem/);
    expect(document.body.classList).toContain("without-engine");
    expect(engineMissing.value).toBe(true);
    expect(pageEngine).toBeNull();
    expect(pageLayoutState.value).toBeNull();
    expect(pageCaret.value).toBeNull();
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(sendNotification).toHaveBeenCalledWith(ENGINE_FAILED);
    // the keys the page view moved by are the editor's own again
    expect(mounted.press("ArrowDown")).toBe(false);
  });

  it("shows no pages when it fails while a long document is laid out", () => {
    vi.useFakeTimers();
    const engine = showPages();
    const mounted = mount(doc(...Array.from({ length: 300 }, () => p(LONG))));
    destroy = () => mounted.view.destroy();
    expect(engine.laying).toBe(true);
    vi.spyOn(engine.raw, "pageCount").mockImplementation(trap);

    vi.runAllTimers();

    expect(pageEngine).toBeNull();
    expect(pageLayoutState.value).toBeNull();
    vi.useRealTimers();
  });

  it("scrolls the editor, which shows the text itself, to the selection", () => {
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, "requestAnimationFrame").mockImplementation((frame) => {
      frames.push(frame);
      return frames.length;
    });
    const engine = showPages();
    const mounted = mount();
    destroy = () => mounted.view.destroy();
    const dispatched = vi.spyOn(mounted.view, "dispatch");
    vi.spyOn(engine.raw, "update").mockImplementation(trap);

    mounted.view.dispatch(mounted.view.state.tr.insertText("a", 1));
    frames.forEach((frame) => frame(0));

    const last = dispatched.mock.calls[dispatched.mock.calls.length - 1][0];
    expect(last.scrolledIntoView).toBe(true);
    expect(last.docChanged).toBe(false);
  });

  it("mounts the editor when the first layout fails", () => {
    const engine = showPages();
    vi.spyOn(engine.raw, "setItems").mockImplementation(trap);

    const mounted = mount();
    destroy = () => mounted.view.destroy();

    expect(pageLayoutState.value).toBeNull();
    expect(document.body.classList).toContain("without-engine");
    mounted.view.dispatch(mounted.view.state.tr.insertText("typed ", 1));
    expect(mounted.view.state.doc.textContent).toMatch(/^typed /);
  });
});

describe("the page view's plugins without the engine", () => {
  it("let the editor scroll to its own selection", () => {
    hidePages();
    const mounted = mount();
    expect(
      mounted.view.someProp("handleScrollToSelection", (f) =>
        f(mounted.view),
      ) ?? false,
    ).toBe(false);
    expect(mounted.press("ArrowDown")).toBe(false);
    mounted.view.destroy();
  });

  it("scroll to the caret they paint while the engine runs", () => {
    showPages();
    const mounted = mount();
    expect(
      mounted.view.someProp("handleScrollToSelection", (f) => f(mounted.view)),
    ).toBe(true);
    mounted.view.destroy();
    hidePages();
  });
});

describe("the first page's header", () => {
  afterEach(() => {
    hidePages();
    transaction.value = null;
  });

  const publish = (frontmatter: string) => {
    const node = docWithFrontmatter(frontmatter, p("text"));
    // the page setup comes from the document of the last transaction
    transaction.value = EditorState.create({ schema, doc: node }).tr;
    showPages();
    const mounted = mount(node);
    const header = pageLayoutState.value?.header;
    mounted.view.destroy();
    return header;
  };

  it("is published when the first page has header text", () => {
    expect(publish("page:\n  header:\n    left: Report")).toBe(true);
  });

  it("isn't without a header, or with a plain first page", () => {
    expect(publish("title: x")).toBe(false);
    expect(
      publish("page:\n  header:\n    left: Report\n  first-page: plain"),
    ).toBe(false);
  });
});

describe("cell selections", () => {
  // three rows of two cells; the cursor at 5 is in the first cell
  const grid = () =>
    doc(
      table(
        tr(td("aa"), td("bb")),
        tr(td("cc"), td("dd")),
        tr(td("ee"), td("ff")),
      ),
    );
  // where the cell in `row` and `column` starts
  const cellPos = (
    node: ReturnType<typeof grid>,
    row: number,
    column: number,
  ) => 1 + TableMap.get(node.firstChild!).map[row * 2 + column];

  beforeEach(() => showPages());
  afterEach(() => hidePages());

  it("selects whole cells with Shift + ↓ and ↑ across cells", () => {
    const mounted = mount(grid(), [tableEditing()]);
    const node = mounted.view.state.doc;

    expect(mounted.press("Shift-ArrowDown")).toBe(true);
    let selection = mounted.view.state.selection;
    expect(selection).toBeInstanceOf(CellSelection);
    expect((selection as CellSelection).$anchorCell.pos).toBe(
      cellPos(node, 0, 0),
    );
    expect((selection as CellSelection).$headCell.pos).toBe(
      cellPos(node, 1, 0),
    );

    // prosemirror-tables grows the cell selection from there
    expect(mounted.press("Shift-ArrowDown")).toBe(true);
    selection = mounted.view.state.selection;
    expect((selection as CellSelection).$headCell.pos).toBe(
      cellPos(node, 2, 0),
    );
    expect(mounted.press("Shift-ArrowUp")).toBe(true);
    selection = mounted.view.state.selection;
    expect((selection as CellSelection).$headCell.pos).toBe(
      cellPos(node, 1, 0),
    );
    mounted.view.destroy();
  });

  it("selects cells when the pointer drags into another cell", () => {
    const node = grid();
    const state = EditorState.create({ schema, doc: node });
    const inOther = cellPos(node, 1, 1) + 2;
    const selection = selectionAt(state, { node: false, pos: inOther }, 5);
    expect(selection).toBeInstanceOf(CellSelection);
    expect((selection as CellSelection).$headCell.pos).toBe(
      cellPos(node, 1, 1),
    );

    let dispatched: EditorState | null = null;
    pageSelect({ node: false, pos: inOther }, 5)(state, (tr) => {
      dispatched = state.apply(tr);
    });
    expect(dispatched!.selection).toBeInstanceOf(CellSelection);
  });

  it("grows a cell selection from the cell it started in", () => {
    const node = grid();
    let state = EditorState.create({ schema, doc: node });
    state = state.apply(
      state.tr.setSelection(
        CellSelection.create(node, cellPos(node, 0, 0), cellPos(node, 0, 1)),
      ),
    );
    // Shift + click in (1, 1)
    const selection = selectionAt(
      state,
      { node: false, pos: cellPos(node, 1, 1) + 2 },
      state.selection.anchor,
    ) as CellSelection;
    expect(selection.$anchorCell.pos).toBe(cellPos(node, 0, 0));
    expect(selection.$headCell.pos).toBe(cellPos(node, 1, 1));
  });

  it("leaves a cell selection to the editor on other keys", () => {
    const mounted = mount(grid(), [tableEditing()]);
    mounted.press("Shift-ArrowDown");
    expect(mounted.view.state.selection).toBeInstanceOf(CellSelection);
    for (const key of ["Shift-End", "Shift-Home", "Shift-PageDown"])
      expect(mounted.press(key)).toBe(false);
    mounted.view.destroy();
  });

  it("selects text within one cell", () => {
    const state = EditorState.create({ schema, doc: grid() });
    const selection = selectionAt(state, { node: false, pos: 6 }, 4);
    expect(selection).toBeInstanceOf(TextSelection);
    expect([selection.from, selection.to]).toEqual([4, 6]);
  });
});

describe("images on the pages", () => {
  let loads: { src: string; load: () => void }[] = [];

  beforeEach(() => {
    loads = [];
    vi.stubGlobal(
      "Image",
      class {
        onload: (() => void) | null = null;
        onerror: (() => void) | null = null;
        naturalWidth = 0;
        naturalHeight = 0;
        set src(src: string) {
          loads.push({
            src,
            load: () => {
              this.naturalWidth = 300;
              this.naturalHeight = 150;
              this.onload?.();
            },
          });
        }
      },
    );
    path.value = null;
    showPages();
  });
  afterEach(() => {
    hidePages();
    forgetImages();
    path.value = null;
  });

  it("shows an untitled document's relative image once it's saved", () => {
    const image = schema.node("image", { src: "img.png", alt: "a cat" });
    const mounted = mount(
      doc(p("text"), schema.node("paragraph", null, image)),
    );
    const shownImages = () =>
      pageEngine!.bodyDisplay(0, pageLayoutState.value!.bodyVersions[0]).i;

    // no folder to look for it in
    expect(loads).toEqual([]);

    path.value = "/docs/report.md";
    expect(loads).toHaveLength(1);
    loads[0].load();

    const [shown] = shownImages();
    expect(shown[0]).toBe("img.png");
    // 300 × 150 px at 96 dpi
    expect(shown[3]).toBeCloseTo(225);
    expect(shown[4]).toBeCloseTo(112.5);
    mounted.view.destroy();
  });

  it("loads the images of another document again", () => {
    const image = schema.node("image", { src: "img.png", alt: "a cat" });
    path.value = "/docs/report.md";
    const mounted = mount(
      doc(p("some text"), schema.node("paragraph", null, image)),
    );
    loads[0].load();
    expect(loadedImages.value.size).toBe(1);
    // opened: the same src may be another picture, or changed on disk
    mounted.view.updateState(
      applyDocument(
        mounted.view.state,
        doc(schema.node("paragraph", null, image)),
      ),
    );
    expect(loads).toHaveLength(2);
    mounted.view.destroy();
  });

  it("follows a Save As after a transaction another plugin added to", () => {
    const image = schema.node("image", { src: "img.png", alt: "a cat" });
    // adds a paragraph after each change, as the table guard may
    const appending = new PluginClass({
      appendTransaction: (trs, _old, state) =>
        trs.some((tr) => tr.docChanged && !tr.getMeta("appended"))
          ? state.tr
              .insert(state.doc.content.size, p("kept"))
              .setMeta("appended", true)
          : null,
    });
    const state = EditorState.create({
      schema,
      doc: doc(p("text"), schema.node("paragraph", null, image)),
      plugins: [pageSync(), pageView(), appending],
    });
    // as bootEditor dispatches: the transaction is published first
    const view: EditorView = new EditorView(document.createElement("div"), {
      state,
      dispatchTransaction(tr) {
        transaction.value = tr;
        view.updateState(view.state.apply(tr));
      },
    });
    view.dispatch(view.state.tr.insertText("typed ", 1));
    expect(view.state.doc.lastChild!.textContent).toBe("kept");

    path.value = "/docs/report.md";

    expect(loads).toHaveLength(1);
    view.destroy();
    transaction.value = null;
  });
});

describe("laying out a keystroke", () => {
  afterEach(() => {
    hidePages();
    transaction.value = null;
  });

  it("lays out once per key in the heading the title comes from", () => {
    showPages();
    let state = EditorState.create({
      schema,
      doc: doc(h(1, "Title"), p("text")),
      plugins: [pageSync(), pageView()],
    });
    state = state.apply(
      state.tr.setSelection(TextSelection.create(state.doc, 6)),
    );
    transaction.value = state.tr;
    // as bootEditor dispatches: the transaction is published first
    const view: EditorView = new EditorView(document.createElement("div"), {
      state,
      dispatchTransaction(tr) {
        transaction.value = tr;
        view.updateState(view.state.apply(tr));
      },
    });
    perfSamples(true);

    for (const key of "abcde") view.dispatch(view.state.tr.insertText(key));

    expect(view.state.doc.firstChild!.textContent).toBe("Titleabcde");
    expect(perfSamples().layout).toHaveLength(5);
    view.destroy();
  });
});

describe("a table of contents on the pages", () => {
  let destroy = () => {};
  afterEach(() => {
    destroy();
    hidePages();
  });

  const toc = () => schema.node("toc", { depth: 2 });
  // the entries of the table of contents the engine was last sent
  let sent: string[] = [];
  const watchEntries = () => {
    sent = [];
    const flatten = flattening.flattenBlocks;
    vi.spyOn(flattening, "flattenBlocks").mockImplementation((...args) => {
      const blocks = flatten(...args);
      for (const record of blocks.flat()) {
        const item = record.build();
        if (item.kind === "toc") sent = item.entries.map((entry) => entry.text);
      }
      return blocks;
    });
  };
  const entries = () => sent;

  it("follows its headings as they are edited elsewhere", () => {
    const engine = showPages();
    watchEntries();
    const mounted = mount(
      doc(p("x"), toc(), h(1, "One"), p(LONG), h(2, "Two")),
    );
    destroy = () => mounted.pluginView.destroy?.();
    expect(entries()).toEqual(["One", "Two"]);
    expect(engine.tocNumbers(3)).toEqual(["1", "1"]);
    const { view } = mounted;
    // typing in a heading after it
    const two = view.state.doc.content.size - 1;
    view.dispatch(view.state.tr.insertText(" more", two));
    expect(entries()).toEqual(["One", "Two more"]);
    // a new heading
    view.dispatch(
      view.state.tr.insert(
        view.state.doc.content.size,
        schema.node("heading", { level: 1 }, schema.text("Three")),
      ),
    );
    expect(entries()).toEqual(["One", "Two more", "Three"]);
  });

  it("isn't laid out again for typing that changes no heading", () => {
    const engine = showPages();
    const mounted = mount(doc(p("x"), toc(), h(1, "One"), p(LONG)));
    destroy = () => mounted.pluginView.destroy?.();
    const laid = vi.spyOn(engine, "sync");
    const flattened = vi.spyOn(flattening, "flattenBlocks");
    mounted.view.dispatch(mounted.view.state.tr.insertText("typed ", 1));
    expect(laid).toHaveBeenCalledOnce();
    const blocks = flattened.mock.calls.map(([, from, to]) => [from, to]);
    expect(blocks).toEqual([[0, 1]]);
  });
});

describe("opening another document", () => {
  afterEach(() => {
    hidePages();
    transaction.value = null;
    path.value = null;
  });

  it("lays out only the new document, with its path", () => {
    showPages();
    const mounted = mount(doc(p("the old document"), p(LONG)));
    const flattened = vi.spyOn(flattening, "flattenBlocks");
    const opened = doc(p("the new document"));

    const next = applyDocument(mounted.view.state, opened, "/docs/new.md");
    expect(flattened).not.toHaveBeenCalled();

    mounted.view.updateState(next);
    expect(flattened).toHaveBeenCalled();
    expect(
      flattened.mock.calls.every(([laidOut]) => laidOut === next.doc),
    ).toBe(true);
    mounted.view.destroy();
  });
});

describe("the kept widths of a table", () => {
  afterEach(() => hidePages());

  it("are the new document's own after another is opened", () => {
    const engine = showPages();
    const first = doc(table(tr(td("a"), td("a much longer cell"))), p("x"));
    const mounted = mount(first);
    // the cursor in the table keeps its widths
    const into = (at: number) =>
      mounted.view.dispatch(
        mounted.view.state.tr.setSelection(
          TextSelection.create(mounted.view.state.doc, at),
        ),
      );
    into(4);

    const second = doc(
      table(tr(td("a cell that is much longer"), td("b"))),
      p("x"),
    );
    const sent: { kind: string; widths?: number[] }[] = [];
    const update = engine.raw.update.bind(engine.raw);
    vi.spyOn(engine.raw, "update").mockImplementation(
      (start, count, json, shift) => {
        sent.push(...JSON.parse(json));
        return update(start, count, json, shift);
      },
    );
    // the new document starts with the cursor in its table
    mounted.view.updateState(applyDocument(mounted.view.state, second));
    into(6);

    const tables = sent.filter((item) => item.kind === "table");
    const widths = tables[tables.length - 1]?.widths;
    expect(widths).toEqual(tableGrid(second.firstChild!).widths);
    expect(widths).not.toEqual(tableGrid(first.firstChild!).widths);
    mounted.view.destroy();
  });
});

describe("the line a caret is on", () => {
  // a word wider than a line, which the engine breaks: each of its lines
  // ends where the next one starts
  const URL = `https://example.com/${"abcdefghij".repeat(40)}`;
  let destroy = () => {};

  beforeEach(() => showPages());
  afterEach(() => {
    destroy();
    hidePages();
  });

  it("keeps End on the line it's pressed on, twice", () => {
    const mounted = mount(doc(p(URL), p("after")));
    destroy = () => mounted.view.destroy();
    const start = pageCaret.value!;

    expect(mounted.press("End")).toBe(true);
    const end = mounted.view.state.selection.head;
    expect(end).toBeLessThan(URL.length);
    expect(pageCaret.value!.y).toBe(start.y);
    expect(pageCaret.value!.x).toBeGreaterThan(start.x);

    mounted.press("End");
    expect(mounted.view.state.selection.head).toBe(end);
    expect(pageCaret.value!.y).toBe(start.y);

    // Home goes back to the start of that line
    mounted.press("Home");
    expect(mounted.view.state.selection.head).toBe(1);
  });

  it("visits each line once going down and up from a line's end", () => {
    const mounted = mount(doc(p(URL), p("after")));
    destroy = () => mounted.view.destroy();
    mounted.view.dispatch(
      mounted.view.state.tr.setSelection(
        TextSelection.create(mounted.view.state.doc, 1),
      ),
    );
    const first = pageCaret.value!.y;
    mounted.press("End");
    const lines = [pageCaret.value!.y];
    // at the end of the first line, not at the start of the second
    expect(lines[0]).toBe(first);
    for (let key = 0; key < 2; key++) {
      mounted.press("ArrowDown");
      lines.push(pageCaret.value!.y);
    }
    const back: number[] = [];
    for (let key = 0; key < 2; key++) {
      mounted.press("ArrowUp");
      back.push(pageCaret.value!.y);
    }

    // one line at a time: down, then the same lines back up
    const step = lines[1] - lines[0];
    expect(step).toBeGreaterThan(5);
    expect(lines[2] - lines[1]).toBeCloseTo(step, 3);
    expect(back).toEqual([lines[1], lines[0]]);
  });

  it("publishes where the head is painted, on its own line", () => {
    const mounted = mount(doc(p(URL), p("after")));
    destroy = () => mounted.view.destroy();
    const start = pageHeadBox.value!;
    mounted.press("End");
    // the end of the first line, where the second one starts too
    expect(pageHeadBox.value!.y).toBe(start.y);
    expect(pageHeadBox.value).toEqual(pageCaret.value);
    // a range's head too, where no caret is painted
    mounted.press("Shift-Home");
    expect(pageCaret.value).toBeNull();
    expect(pageHeadBox.value).toMatchObject({ page: 0, y: start.y });
  });

  it("forgets it once the caret moves another way", () => {
    const mounted = mount(doc(p(URL), p("after")));
    destroy = () => mounted.view.destroy();
    mounted.press("End");
    expect(pageViewKey.getState(mounted.view.state)?.after).toBe(true);
    // a transaction that moves nothing keeps it
    mounted.view.dispatch(mounted.view.state.tr.setMeta("other", true));
    expect(pageViewKey.getState(mounted.view.state)?.after).toBe(true);
    mounted.view.dispatch(mounted.view.state.tr.insertText("x"));
    expect(pageViewKey.getState(mounted.view.state)?.after).toBeFalsy();
  });
});

describe("the pages after many real edits", () => {
  const start = () =>
    doc(
      h(1, "Title"),
      p("First paragraph with some words in it"),
      blockquote(p("quoted"), p("more quoted")),
      ul(li(p("one")), li(p("two"))),
      h(2, "Section"),
      table(tr(td("a"), td("b")), tr(td("c"), td("d"))),
      p("Last paragraph"),
    );

  afterEach(() => hidePages());

  it(
    "are what a fresh layout gives, with every caret",
    { timeout: 180_000 },
    () => {
      const engine = showPages();
      const view = new EditorView(document.createElement("div"), {
        state: EditorState.create({
          schema,
          doc: start(),
          plugins: [pageSync(), pageView(), history()],
        }),
      });
      const next = random(930);
      const run = (command: Command) => command(view.state, view.dispatch);
      const select = () =>
        view.dispatch(
          view.state.tr.setSelection(
            Selection.near(
              view.state.doc.resolve(
                Math.floor(next() * view.state.doc.content.size),
              ),
            ),
          ),
        );
      const edits: (() => void)[] = [
        () => (select(), view.dispatch(view.state.tr.insertText("typed "))),
        () => (select(), run(splitBlock)),
        () => {
          select();
          const { $head } = view.state.selection;
          view.dispatch(
            view.state.tr.setSelection(
              TextSelection.create(view.state.doc, $head.start()),
            ),
          );
          run(joinBackward);
        },
        () => (select(), run(wrapIn(schema.nodes.blockquote))),
        () => (select(), run(lift)),
        () => (select(), run(wrapInList(schema.nodes.bullet_list))),
        () => (select(), run(sinkListItem(schema.nodes.list_item))),
        // bold over a range, which changes marks only
        () => {
          select();
          const { from } = view.state.selection;
          const to = Math.min(
            from + 1 + Math.floor(next() * 20),
            view.state.doc.content.size,
          );
          view.dispatch(
            view.state.tr.setSelection(
              TextSelection.between(
                view.state.doc.resolve(from),
                view.state.doc.resolve(to),
              ),
            ),
          );
          run(toggleMark(schema.marks.strong));
        },
        // an attribute of a block: a table's caption, a heading's level
        () => {
          const blocks: number[] = [];
          view.state.doc.forEach((node, offset) => {
            if (node.type.name === "table" || node.type.name === "heading")
              blocks.push(offset);
          });
          if (!blocks.length) return;
          const pos = blocks[Math.floor(next() * blocks.length)];
          const node = view.state.doc.nodeAt(pos)!;
          view.dispatch(
            node.type.name === "table"
              ? view.state.tr.setNodeAttribute(
                  pos,
                  "caption",
                  `Caption ${Math.floor(next() * 9)}`,
                )
              : view.state.tr.setNodeAttribute(
                  pos,
                  "level",
                  1 + Math.floor(next() * 3),
                ),
          );
        },
        () => run(undo),
        () => run(redo),
      ];

      // the same as a fresh engine lays out, with the caret at every place
      const expectFresh = (step: number) => {
        // out of a table, whose widths are kept while the cursor is in it
        view.dispatch(
          view.state.tr.setSelection(Selection.atStart(view.state.doc)),
        );
        const fresh = testEngine();
        fresh.setSettings(pageLayout.value.layout, pageFields.value);
        fresh.sync(view.state.doc, () => undefined);
        expect(engine.pages(), `after ${step}`).toBe(fresh.pages());
        for (let page = 0; page < fresh.pages(); page++)
          expect(pageOf(engine, page), `after ${step}`).toEqual(
            pageOf(fresh, page),
          );
        for (let pos = 0; pos <= view.state.doc.content.size; pos++)
          for (const after of [false, true])
            expect(engine.caret(pos, after), `after ${step} at ${pos}`).toEqual(
              fresh.caret(pos, after),
            );
        fresh.free();
      };

      for (let step = 1; step <= 300; step++) {
        // another document now and then, as opening one does
        if (step % 100 === 0)
          view.updateState(applyDocument(view.state, start()));
        else edits[Math.floor(next() * edits.length)]();
        expectFresh(step);
      }
      view.destroy();
    },
  );
});
