import { EditorState, NodeSelection, TextSelection } from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { setPageEngine } from "../../engine/engine";
import { schema } from "../../markdown";
import {
  pageCaret,
  pageLayoutState,
  pageScrollRequest,
  pageSelection,
} from "../../state";
import { doc, keyEvent, p } from "../../test/editor";
import { testEngine } from "../../test/engine";
import { pageSelect, pageSelectRange } from "../commands/pageSelect";
import { pageView, pageViewKey, selectionAt } from "./pageView";

const LONG =
  "Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris.";

// a view that runs the plugin's view like EditorView does
const mount = (node = doc(p(LONG), p(LONG))) => {
  const plugin = pageView();
  let state = EditorState.create({ schema, doc: node, plugins: [plugin] });
  state = state.apply(
    state.tr.setSelection(TextSelection.create(state.doc, 5)),
  );
  const view = {
    state,
    dispatch(tr: import("prosemirror-state").Transaction) {
      const previous = view.state;
      view.state = view.state.apply(tr);
      pluginView.update?.(view as unknown as EditorView, previous);
    },
  };
  const pluginView = plugin.spec.view!(view as unknown as EditorView);
  const press = (combo: string) =>
    plugin.props.handleKeyDown!.call(
      plugin,
      view as unknown as EditorView,
      keyEvent(combo),
    );
  return { view, plugin, pluginView, press };
};

describe("pageView plugin", () => {
  let destroy = () => {};

  beforeEach(() => setPageEngine(testEngine()));
  afterEach(() => {
    destroy();
    setPageEngine(null);
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
