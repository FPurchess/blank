import {
  type EditorState,
  NodeSelection,
  Plugin,
  PluginKey,
  Selection,
  TextSelection,
  type Transaction,
} from "prosemirror-state";
import type { EditorView } from "prosemirror-view";
import { watch } from "vue";

import { pageEngine, type Hit, type PageEngine } from "../../engine/engine";
import { imageSizes, imagesLoaded } from "../../engine/images";
import { timed } from "../../engine/perf";
import { pageGeometry } from "../../layout/resolve";
import {
  pageCaret,
  pageFields,
  pageLayout,
  pageLayoutState,
  pageScrollRequest,
  pageSelection,
  path,
} from "../../state";

// The page view's side of the editor: keeps the layout engine in step with
// the document, publishes the pages, the caret and the selection for
// src/ui/PageView.vue to paint, and moves the caret by the lines the engine
// laid out, since the hidden editor's own lines aren't the ones shown.

// set on a transaction whose selection came from the pointer, which needs
// no scrolling
export const POINTER = "pointer";

interface PageViewState {
  // how the last transaction moved the selection
  by: "pointer" | "vertical" | null;
}

export const pageViewKey = new PluginKey<PageViewState>("pageView");

/**
 * selectionAt returns a selection at a hit: a caret, a selected node, or,
 * with `anchor`, a range from it
 */
export const selectionAt = (
  state: EditorState,
  hit: Hit,
  anchor?: number,
): Selection => {
  const { doc } = state;
  const pos = Math.max(0, Math.min(hit.pos, doc.content.size));
  if (anchor !== undefined)
    return TextSelection.between(doc.resolve(anchor), doc.resolve(pos));
  if (hit.node) {
    const node = doc.nodeAt(pos);
    if (node && NodeSelection.isSelectable(node))
      return NodeSelection.create(doc, pos);
  }
  return TextSelection.between(doc.resolve(pos), doc.resolve(pos));
};

/**
 * publishLayout publishes the pages as the engine laid them out
 */
const publishLayout = (engine: PageEngine) => {
  const { layout } = pageLayout.value;
  const { width, height, margins } = pageGeometry(layout);
  pageLayoutState.value = {
    width,
    height,
    margins,
    pages: engine.pages(),
    versions: engine.raw.versions(),
    bottoms: engine.raw.bottoms(),
  };
};

/**
 * publishSelection publishes where the caret or the selection is, and asks
 * the view to scroll to it unless the pointer put it there
 */
const publishSelection = (
  engine: PageEngine,
  state: EditorState,
  scroll: boolean,
) => {
  const { selection } = state;
  if (selection.empty) {
    const caret = engine.caret(selection.head);
    pageCaret.value = caret;
    pageSelection.value = [];
    if (scroll && caret) pageScrollRequest.value = { ...caret };
    return;
  }
  pageCaret.value = null;
  const rects = engine.selection(selection.from, selection.to);
  pageSelection.value = rects;
  const head = engine.caret(selection.head);
  if (scroll && head) pageScrollRequest.value = { ...head };
};

/**
 * sync hands the engine the document and the page
 * @param force flattens the document again, e.g. once an image is loaded
 */
const sync = (engine: PageEngine, state: EditorState, force = false) => {
  const { layout } = pageLayout.value;
  const changed = engine.setSettings(layout, pageFields.value);
  const { contentWidth, contentHeight } = pageGeometry(layout);
  const sizes = imageSizes(path.value, {
    width: contentWidth,
    height: contentHeight,
  });
  engine.sync(state.doc, sizes, force || changed);
  publishLayout(engine);
};

const VERTICAL: Record<string, boolean> = { ArrowUp: false, ArrowDown: true };

export const pageView = () => {
  // the x the caret keeps while it moves up and down, in points
  let goal: number | null = null;

  const move = (
    view: EditorView,
    selection: Selection,
    by: PageViewState["by"],
  ) => {
    view.dispatch(
      view.state.tr
        .setSelection(selection)
        .setMeta(pageViewKey, by)
        .scrollIntoView(),
    );
  };

  return new Plugin<PageViewState>({
    key: pageViewKey,
    state: {
      init: () => ({ by: null }),
      apply: (tr: Transaction) => ({
        by:
          (tr.getMeta(pageViewKey) as PageViewState["by"] | undefined) ?? null,
      }),
    },
    view(view) {
      const engine = pageEngine;
      if (!engine) return {};
      sync(engine, view.state);
      publishSelection(engine, view.state, false);
      // the page setup, the fields of headers and footers, loaded images
      const stop = watch(
        [pageLayout, pageFields, imagesLoaded],
        () => {
          timed("layout", () => sync(engine, view.state, true));
          publishSelection(engine, view.state, false);
        },
        { flush: "sync" },
      );
      return {
        update(view, previous) {
          const docChanged = view.state.doc !== previous.doc;
          if (docChanged) timed("layout", () => sync(engine, view.state));
          if (docChanged || !view.state.selection.eq(previous.selection)) {
            const by = pageViewKey.getState(view.state)?.by ?? null;
            if (by !== "vertical") goal = null;
            timed("caret", () =>
              publishSelection(engine, view.state, by !== "pointer"),
            );
          }
        },
        destroy() {
          stop();
          pageLayoutState.value = null;
          pageCaret.value = null;
          pageSelection.value = [];
        },
      };
    },
    props: {
      handleKeyDown(view, event) {
        const engine = pageEngine;
        if (!engine || event.ctrlKey || event.metaKey || event.altKey)
          return false;
        const { selection } = view.state;
        const down = VERTICAL[event.key];
        if (down !== undefined) {
          const caret = engine.caret(selection.head);
          if (!caret) return false;
          goal ??= caret.x;
          const hit = engine.vertical(selection.head, down, goal);
          const target =
            hit ??
            // from the first or last line to the start or end
            ({
              node: false,
              pos: down ? Selection.atEnd(view.state.doc).to : 0,
            } satisfies Hit);
          const current = goal;
          move(
            view,
            selectionAt(
              view.state,
              target,
              event.shiftKey ? selection.anchor : undefined,
            ),
            "vertical",
          );
          goal = current;
          return true;
        }
        if (event.key === "Home" || event.key === "End") {
          const edge = engine.lineEdge(selection.head, event.key === "End");
          if (edge === null) return false;
          move(
            view,
            selectionAt(
              view.state,
              { node: false, pos: edge },
              event.shiftKey ? selection.anchor : undefined,
            ),
            null,
          );
          return true;
        }
        return false;
      },
      // the page view scrolls to the caret it paints
      handleScrollToSelection: () => true,
    },
  });
};
