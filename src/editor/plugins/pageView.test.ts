import { EditorState, NodeSelection, TextSelection } from "prosemirror-state";
import { EditorView } from "prosemirror-view";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { schema } from "../../markdown";
import {
  pageCaret,
  pageComposition,
  pageLayoutState,
  pageNodeSelection,
  pageScrollRequest,
  pageSelection,
} from "../../state";
import { doc, keyEvent, p, table, td, tr } from "../../test/editor";
import { pageEngine } from "../../engine/engine";
import { hidePages, showPages } from "../../test/engine";
import { caretBox } from "../../engine/geometry";
import { pageSelect, pageSelectRange } from "../commands/pageSelect";
import { pageSync, pageView, pageViewKey, selectionAt } from "./pageView";

const LONG =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.";

// an editor with the page view's plugins, on the pages the app shows
const mount = (node = doc(p(LONG), p(LONG))) => {
  let state = EditorState.create({
    schema,
    doc: node,
    plugins: [pageSync(), pageView()],
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
