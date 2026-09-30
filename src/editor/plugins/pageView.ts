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
import { computed, watch } from "vue";

import {
  pageEngine,
  pageEngineReady,
  type Hit,
  type PageEngine,
} from "../../engine/engine";
import { caretBox, hitAt, viewBox } from "../../engine/geometry";
import { imageSizes, imagesLoaded } from "../../engine/images";
import { bootMark, timed } from "../../engine/perf";
import { shownSelection } from "../../engine/selection";
import { fallbackFonts, findFonts } from "../../engine/fallback";
import { summarize } from "./properties";
import { tableAround } from "./tables/util";
import { columnPercents } from "../../markdown/tables";
import { tableGrid } from "../../exporters/table";
import type { FrozenWidths } from "../../engine/flatten";
import { TableMap } from "prosemirror-tables";
import { pageGeometry } from "../../layout/resolve";
import {
  frontmatter,
  language,
  pageCaret,
  pageComposition,
  pageFields,
  pageLayout,
  pageLayoutState,
  pageNodeSelection,
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
export const POINTER = "pointer" as const;

export interface PageViewState {
  // how the last transaction moved the selection
  by: "pointer" | "vertical" | "page" | null;
  // for "page": how far below the top of the view the head stays, in px
  at?: number;
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

// whether the document's properties show above the first page, read again
// only when the frontmatter changes
const hasProperties = computed(() => summarize(frontmatter.value) !== null);

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
    properties: hasProperties.value,
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
  at?: number,
) => {
  const { selection } = state;
  const shown = shownSelection(engine, selection);
  pageCaret.value = shown.caret;
  pageSelection.value = shown.rects;
  pageNodeSelection.value = shown.nodes;
  const head = shown.caret ?? engine.caret(selection.head);
  if (scroll && head)
    pageScrollRequest.value = at === undefined ? { ...head } : { ...head, at };
};

/**
 * publishComposition underlines the text being composed, from where the
 * composition started to the head
 */
const publishComposition = (
  engine: PageEngine,
  state: EditorState,
  from: number | null,
) => {
  const to = state.selection.head;
  pageComposition.value =
    from === null || to <= from ? [] : engine.selection(from, to);
};

/**
 * frozenWidths keeps the column widths of the table the cursor is in as they
 * were when it went in, so the columns don't move while typing; they follow
 * the text again once it leaves. Widths set on the table stay as they are.
 */
export const frozenWidths = (
  state: EditorState,
  frozen: FrozenWidths | null,
): FrozenWidths | null => {
  const table = tableAround(state.selection.$head);
  if (!table || columnPercents(table.node)) return null;
  const { width } = TableMap.get(table.node);
  if (frozen?.pos === table.pos && frozen.widths.length === width)
    return frozen;
  return { pos: table.pos, widths: tableGrid(table.node).widths };
};

/**
 * sync hands the engine the document and the page
 * @param force flattens the document again, e.g. once an image is loaded
 */
const sync = (
  engine: PageEngine,
  state: EditorState,
  frozen: FrozenWidths | null,
  force = false,
  progressive = false,
) => {
  const { layout } = pageLayout.value;
  const changed = engine.setSettings(layout, pageFields.value);
  const { contentWidth, contentHeight } = pageGeometry(layout);
  const sizes = imageSizes(path.value, {
    width: contentWidth,
    height: contentHeight,
  });
  const laidOut = engine.sync(
    state.doc,
    sizes,
    force || changed,
    frozen,
    progressive,
  );
  if (laidOut || changed || !pageLayoutState.value) {
    publishLayout(engine);
    // fonts for what Blank's fonts lack, which lay out again once found
    const missing = engine.missing();
    if (missing) void findFonts(missing, language.value);
  }
};

const VERTICAL: Record<string, boolean> = { ArrowUp: false, ArrowDown: true };
// how much of the view's height Page Up and Down move
const PAGE_STEP = 0.85;

/**
 * pageSync keeps the layout engine in step with the editor, and publishes
 * the pages, the caret and the selection. It comes first of the plugins, so
 * the views of the others measure the new layout when they update.
 */
export const pageSync = () => {
  // where the text being composed starts, while an input method composes
  let composing: number | null = null;
  // the widths kept of the table the cursor is in
  let frozen: FrozenWidths | null = null;
  return new Plugin({
    props: {
      handleDOMEvents: {
        compositionstart: (view) => {
          composing = view.state.selection.from;
          return false;
        },
        compositionend: (view) => {
          composing = null;
          if (pageEngine) publishComposition(pageEngine, view.state, null);
          return false;
        },
      },
    },
    view(view) {
      let engine: PageEngine | null = null;
      const stops: (() => void)[] = [];
      const start = (ready: PageEngine) => {
        engine = ready;
        // a long document lays out its first pages first, and the rest a
        // chunk at a time, which each shows as it comes
        ready.onProgress = () => {
          publishLayout(ready);
          publishSelection(ready, view.state, false);
        };
        sync(ready, view.state, frozen, false, true);
        bootMark("layout");
        publishSelection(ready, view.state, false);
        stops.push(
          // fonts found for what Blank's fonts lack
          watch(
            fallbackFonts,
            (fonts) => {
              if (!ready.addFonts(fonts)) return;
              timed("layout", () => sync(ready, view.state, frozen, true));
              publishSelection(ready, view.state, false);
            },
            { flush: "sync" },
          ),
          // the page setup, the fields of headers and footers, loaded images
          watch(
            [pageLayout, pageFields, imagesLoaded],
            () => {
              timed("layout", () => sync(ready, view.state, frozen, true));
              publishSelection(ready, view.state, false);
            },
            { flush: "sync" },
          ),
        );
      };
      // the engine loads while the editor boots
      if (pageEngine) start(pageEngine);
      else {
        const waiting = watch(
          pageEngineReady,
          (ready) => {
            if (!ready || engine) return;
            waiting();
            start(ready);
          },
          { flush: "sync" },
        );
        stops.push(waiting);
      }
      return {
        update(view, previous) {
          if (!engine) return;
          const docChanged = view.state.doc !== previous.doc;
          // a move into or out of a table freezes or relaxes its columns
          const moved = !view.state.selection.eq(previous.selection);
          if (docChanged || moved)
            timed("layout", () => {
              frozen = frozenWidths(view.state, frozen);
              sync(engine!, view.state, frozen);
            });
          if (docChanged || moved) {
            const by = pageViewKey.getState(view.state);
            timed("caret", () =>
              publishSelection(
                engine!,
                view.state,
                by?.by !== "pointer",
                by?.at,
              ),
            );
          }
          if (composing !== null) {
            publishComposition(engine, view.state, composing);
          }
        },
        destroy() {
          stops.forEach((stop) => stop());
          if (engine) {
            engine.onProgress = null;
            engine.finish();
          }
          pageLayoutState.value = null;
          pageCaret.value = null;
          pageSelection.value = [];
          pageNodeSelection.value = [];
          pageComposition.value = [];
        },
      };
    },
  });
};

export const pageView = () => {
  // the x the caret keeps while it moves up and down, in points
  let goal: number | null = null;

  const move = (
    view: EditorView,
    selection: Selection,
    by: PageViewState["by"],
    at?: number,
  ) => {
    view.dispatch(
      view.state.tr
        .setSelection(selection)
        .setMeta(pageViewKey, { by, at } satisfies PageViewState)
        .scrollIntoView(),
    );
  };

  /**
   * page moves the head a view's height up or down, and scrolls as far, so
   * it stays where it is in the view
   */
  const page = (view: EditorView, down: boolean, extend: boolean) => {
    const { selection, doc } = view.state;
    const caret = caretBox(selection.head);
    const box = viewBox();
    if (!caret || !box) return false;
    const step = Math.max(40, (box.bottom - box.top) * PAGE_STEP);
    const middle = (caret.top + caret.bottom) / 2;
    const hit = hitAt(goal ?? caret.left, middle + (down ? step : -step));
    const edge = down ? Selection.atEnd(doc).to : 0;
    const target =
      hit && hit.pos !== selection.head ? hit : { node: false, pos: edge };
    const current = goal ?? caret.left;
    move(
      view,
      selectionAt(view.state, target, extend ? selection.anchor : undefined),
      "page",
      caret.top - box.top,
    );
    goal = current;
    return true;
  };

  return new Plugin<PageViewState>({
    key: pageViewKey,
    state: {
      init: () => ({ by: null }),
      apply: (tr: Transaction) =>
        (tr.getMeta(pageViewKey) as PageViewState | undefined) ?? {
          by: null,
        },
    },
    view: () => ({
      update(view, previous) {
        const by = pageViewKey.getState(view.state)?.by;
        // a move by the mouse or a key other than ↑↓ forgets the column
        if (
          by !== "vertical" &&
          by !== "page" &&
          !view.state.selection.eq(previous.selection)
        )
          goal = null;
      },
    }),
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
        if (event.key === "PageUp" || event.key === "PageDown") {
          return page(view, event.key === "PageDown", event.shiftKey);
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
