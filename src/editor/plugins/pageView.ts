import {
  type EditorState,
  NodeSelection,
  Plugin,
  PluginKey,
  Selection,
  TextSelection,
  type Transaction,
} from "prosemirror-state";
import type { Node } from "prosemirror-model";
import {
  AddMarkStep,
  AddNodeMarkStep,
  AttrStep,
  DocAttrStep,
  RemoveMarkStep,
  RemoveNodeMarkStep,
  ReplaceAroundStep,
  ReplaceStep,
} from "prosemirror-transform";
import type { EditorView } from "prosemirror-view";
import { computed, watch } from "vue";

import {
  pageEngine,
  pageEngineReady,
  type Hit,
  type Move,
  type PageEngine,
} from "../../engine/engine";
import {
  caretBox,
  hitAt,
  pageBoxInWindow,
  viewBox,
} from "../../engine/geometry";
import {
  forgetFailures,
  forgetImages,
  imageSizes,
  loadedImages,
} from "../../engine/images";
import { bootMark, timed } from "../../engine/perf";
import { shownSelection } from "../../engine/selection";
import { fallbackFonts, findFonts } from "../../engine/fallback";
import { summarize } from "./properties";
import { displaySrc } from "./images";
import { tableAround } from "./tables/util";
import { columnPercents } from "../../markdown/tables";
import { tableGrid } from "../../exporters/table";
import type { FrozenWidths } from "../../engine/flatten";
import {
  CellSelection,
  cellAround,
  inSameTable,
  TableMap,
} from "prosemirror-tables";
import { hasBand } from "../../layout/placeholders";
import { pageGeometry } from "../../layout/resolve";
import {
  frontmatter,
  language,
  pageCaret,
  pageComposition,
  pageHeadBox,
  pageFields,
  pageLayout,
  pageLayoutState,
  pageNodeSelection,
  pageScrollRequest,
  pageSelection,
  path,
  transaction,
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
  // the caret at the head is painted at the end of its line, where the next
  // line starts at the same position; set by ↑↓, Home and End, and false
  // after any other change of the selection
  after?: boolean;
}

/**
 * headAfter tells whether the caret at the head of `state`'s selection is
 * painted at the end of its line, see PageViewState
 */
export const headAfter = (state: EditorState) =>
  pageViewKey.getState(state)?.after ?? false;

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
  if (anchor !== undefined) {
    // from one cell of a table into another selects whole cells, as a drag
    // or Shift + arrow keys did in the editor before the page view
    // a cell selection grows from the cell it started in
    const { selection } = state;
    const $anchorCell =
      selection instanceof CellSelection && anchor === selection.anchor
        ? selection.$anchorCell
        : cellAround(doc.resolve(anchor));
    const $headCell = cellAround(doc.resolve(pos));
    if (
      $anchorCell &&
      $headCell &&
      $anchorCell.pos !== $headCell.pos &&
      inSameTable($anchorCell, $headCell)
    )
      return CellSelection.create(doc, $anchorCell.pos, $headCell.pos);
    return TextSelection.between(doc.resolve(anchor), doc.resolve(pos));
  }
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
  const pages = engine.pages();
  const state = {
    width,
    height,
    margins,
    pages,
    versions: engine.versions(),
    bodyVersions: engine.bodyVersions(),
    bandVersions: engine.bandVersions(),
    bottoms: engine.bottoms(),
    properties: hasProperties.value,
    // whether the first page has a header written and the last a footer,
    // whatever their placeholders come out as, which the page view names
    header: hasBand(layout, 1, "header"),
    footer: hasBand(layout, pages, "footer"),
  };
  // an engine that failed while it was asked has given up, and shows nothing
  if (!engine.broken) pageLayoutState.value = state;
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
  const after = headAfter(state);
  const shown = shownSelection(engine, selection, after);
  pageCaret.value = shown.caret;
  pageSelection.value = shown.rects;
  pageNodeSelection.value = shown.nodes;
  const head = shown.caret ?? engine.caret(selection.head, after);
  const now = pageHeadBox.value;
  if (
    !head ||
    !now ||
    head.page !== now.page ||
    head.x !== now.x ||
    head.y !== now.y ||
    head.height !== now.height
  )
    pageHeadBox.value = head;
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
 * sync hands the engine what changed in the document, and the page
 * @param blocks top-level blocks to flatten again, e.g. once their image
 *   loaded
 */
const sync = (
  engine: PageEngine,
  state: EditorState,
  frozen: FrozenWidths | null,
  { progressive = false, blocks = [] as readonly number[] } = {},
) => {
  const { layout } = pageLayout.value;
  const changed = engine.setSettings(layout, pageFields.value);
  const { contentWidth, contentHeight } = pageGeometry(layout);
  const sizes = imageSizes(path.value, {
    width: contentWidth,
    height: contentHeight,
  });
  const tracked = pageSyncKey.getState(state);
  const laidOut = engine.sync(state.doc, sizes, {
    frozen,
    progressive,
    blocks,
    changes: tracked?.from
      ? { from: tracked.from, ranges: tracked.ranges }
      : null,
    // the room images are fitted into, and the folder relative ones are in
    sizesKey: `${contentWidth}x${contentHeight}:${path.value ?? ""}`,
  });
  // an engine that failed has given up, and shows nothing
  if (engine.broken) return;
  if (laidOut || changed || !pageLayoutState.value) {
    publishLayout(engine);
    // fonts for what Blank's fonts lack, which lay out again once found
    const missing = engine.missing();
    if (missing) void findFonts(missing, language.value);
  }
};

/**
 * imageBlocks returns the top-level blocks of `doc` with an image from one
 * of `urls`
 */
const imageBlocks = (doc: Node, urls: ReadonlySet<string>) => {
  const blocks: number[] = [];
  doc.forEach((block, _offset, index) => {
    let found = false;
    block.descendants((node) => {
      if (found) return false;
      if (node.type.name === "image") {
        const url = displaySrc(node.attrs.src as string, path.value);
        found = url !== null && urls.has(url);
      }
      return !found;
    });
    if (found) blocks.push(index);
  });
  return blocks;
};

// what changed in the document since the engine laid it out: the ranges of
// the current document, counted from `from`, the document the engine has
export interface TrackedChanges {
  from: Node | null;
  ranges: [number, number][];
}

export const pageSyncKey = new PluginKey<TrackedChanges>("pageSync");

// more changed ranges than this are merged into one
const MAX_RANGES = 32;

/**
 * trackChanges adds what a transaction changed to what changed since the
 * engine laid out the document, which starts again from the document the
 * engine has
 */
export const trackChanges = (
  tr: Transaction,
  value: TrackedChanges,
  before: EditorState,
  synced: Node | null,
): TrackedChanges => {
  const base = before.doc === synced ? { from: before.doc, ranges: [] } : value;
  if (!tr.docChanged) return base;
  const ranges: [number, number][] = base.ranges.map(([from, to]) => [
    tr.mapping.map(from, -1),
    tr.mapping.map(to, 1),
  ]);
  for (const [index, step] of tr.steps.entries()) {
    const rest = tr.mapping.slice(index + 1);
    const add = (start: number, end: number) =>
      ranges.push([rest.map(start, -1), rest.map(end, 1)]);
    // steps that change marks or attributes move nothing, so their maps
    // are empty; what they changed is their own range
    if (step instanceof AddMarkStep || step instanceof RemoveMarkStep)
      add(step.from, step.to);
    else if (
      step instanceof AttrStep ||
      step instanceof AddNodeMarkStep ||
      step instanceof RemoveNodeMarkStep
    )
      add(step.pos, step.pos + 1);
    else if (step instanceof ReplaceStep || step instanceof ReplaceAroundStep)
      step
        .getMap()
        .forEach((_oldStart, _oldEnd, start, end) => add(start, end));
    // the frontmatter, which the settings bring
    else if (step instanceof DocAttrStep) continue;
    // a step it doesn't know: the whole document is flattened again
    else return { from: null, ranges: [] };
  }
  return { from: base.from, ranges: merged(ranges) };
};

// the ranges in order, with those that touch joined
const merged = (ranges: [number, number][]): [number, number][] => {
  const sorted = ranges
    .map(([from, to]): [number, number] => [
      Math.min(from, to),
      Math.max(from, to),
    ])
    .sort((a, b) => a[0] - b[0]);
  const joined: [number, number][] = [];
  for (const range of sorted) {
    const last = joined[joined.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else joined.push(range);
  }
  if (joined.length <= MAX_RANGES) return joined;
  return [[joined[0][0], Math.max(...joined.map(([, to]) => to))]];
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
  return new Plugin<TrackedChanges>({
    key: pageSyncKey,
    state: {
      init: () => ({ from: null, ranges: [] }),
      apply: (tr, value, before) =>
        trackChanges(tr, value, before, pageEngine?.syncedDoc ?? null),
    },
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
      // a new document, whose images are its own: another folder's img.png
      // may be another picture, or changed on disk since
      forgetImages();
      // the widths kept of the table the cursor is in, for this view's
      // document only: a new document gets a new view
      let frozen: FrozenWidths | null = null;
      let engine: PageEngine | null = null;
      let stops: (() => void)[] = [];
      // the engine gave up (see PageEngine.call): the editor shows the text
      const teardown = () => {
        stops.forEach((stop) => stop());
        stops = [];
        if (engine) {
          engine.onProgress = null;
          engine.finish();
        }
        engine = null;
        pageLayoutState.value = null;
        pageCaret.value = null;
        pageHeadBox.value = null;
        pageSelection.value = [];
        pageNodeSelection.value = [];
        pageComposition.value = [];
      };
      const start = (ready: PageEngine) => {
        engine = ready;
        // a long document lays out its first pages first, and the rest a
        // chunk at a time, which each shows as it comes
        ready.onProgress = () => {
          publishLayout(ready);
          if (!ready.broken) publishSelection(ready, view.state, false);
        };
        sync(ready, view.state, frozen, { progressive: true });
        // an engine that fails on the document gives up before it watches
        if (engine !== ready) return;
        bootMark("layout");
        publishSelection(ready, view.state, false);
        stops.push(
          // fonts found for what Blank's fonts lack
          watch(
            fallbackFonts,
            (fonts) => {
              // the engine lays out again with them itself
              if (!timed("layout", () => ready.addFonts(fonts))) return;
              if (engine !== ready) return;
              publishLayout(ready);
              publishSelection(ready, view.state, false);
            },
            { flush: "sync" },
          ),
          // the page setup, the fields of headers and footers, loaded
          // images, and the document's folder, which relative images are in
          watch(
            [pageLayout, pageFields, loadedImages, path],
            ([, , loaded], [, , previousLoaded, previousPath]) => {
              if (path.value !== previousPath) forgetFailures();
              const fresh = new Set(
                [...loaded].filter((url) => !previousLoaded?.has(url)),
              );
              // the page setup and the fields follow the transaction being
              // dispatched, which the view doesn't have yet: its update lays
              // out once, with them. Once the view has it, and the
              // transactions appended to it, a change is laid out here.
              // So does a document on its way to the editor (applyDocument),
              // whose new plugin view lays it out.
              const pending = transaction.value;
              if (
                !fresh.size &&
                pending &&
                (pending.docChanged
                  ? pending.before === view.state.doc
                  : pending.doc !== view.state.doc)
              )
                return;
              const blocks = fresh.size
                ? imageBlocks(view.state.doc, fresh)
                : [];
              timed("layout", () =>
                sync(ready, view.state, frozen, { blocks }),
              );
              if (engine === ready) publishSelection(ready, view.state, false);
            },
            { flush: "sync" },
          ),
        );
      };
      // the engine loads while the editor boots, and is gone once it failed
      const watching = watch(
        pageEngineReady,
        (ready) => {
          if (ready) {
            if (!engine) start(ready);
            return;
          }
          const failed = engine !== null;
          teardown();
          // the editor shows the text itself now, from its top: it scrolls
          // to the selection, once it's laid out, outside this update
          if (failed)
            requestAnimationFrame(() => {
              if (!view.isDestroyed)
                view.dispatch(view.state.tr.scrollIntoView());
            });
        },
        { flush: "sync" },
      );
      if (pageEngine) start(pageEngine);
      return {
        update(view, previous) {
          const current = engine;
          if (!current) return;
          const docChanged = view.state.doc !== previous.doc;
          // a move into or out of a table freezes or relaxes its columns
          const moved = !view.state.selection.eq(previous.selection);
          if (docChanged || moved) {
            timed("layout", () => {
              frozen = frozenWidths(view.state, frozen);
              sync(current, view.state, frozen);
            });
            // the engine may have failed on the change and given up
            if (engine !== current) return;
            const by = pageViewKey.getState(view.state);
            timed("caret", () =>
              publishSelection(
                current,
                view.state,
                by?.by !== "pointer",
                by?.at,
              ),
            );
          }
          if (composing !== null) {
            publishComposition(current, view.state, composing);
          }
        },
        destroy() {
          watching();
          teardown();
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
    after = false,
  ) => {
    view.dispatch(
      view.state.tr
        .setSelection(selection)
        .setMeta(pageViewKey, { by, at, after } satisfies PageViewState)
        .scrollIntoView(),
    );
  };

  /**
   * page moves the head a view's height up or down, and scrolls as far, so
   * it stays where it is in the view
   */
  const page = (
    view: EditorView,
    engine: PageEngine,
    down: boolean,
    extend: boolean,
  ) => {
    const { selection, doc } = view.state;
    const after = headAfter(view.state);
    const onPage = engine.caret(selection.head, after);
    const caret = caretBox(selection.head, after);
    const box = viewBox();
    if (!onPage || !caret || !box) return false;
    // the column is kept in points, as ↑ and ↓ keep it
    const current = goal ?? onPage.x;
    const column =
      pageBoxInWindow({ ...onPage, x: current, width: 0 })?.left ?? caret.left;
    const step = Math.max(40, (box.bottom - box.top) * PAGE_STEP);
    const middle = (caret.top + caret.bottom) / 2;
    const hit = hitAt(column, middle + (down ? step : -step));
    const edge = down ? Selection.atEnd(doc).to : 0;
    const target =
      hit && hit.pos !== selection.head ? hit : { node: false, pos: edge };
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
      apply: (tr: Transaction, value) => {
        const meta = tr.getMeta(pageViewKey) as PageViewState | undefined;
        if (meta) return meta;
        // a transaction that moves nothing keeps how the caret is painted
        if (!tr.selectionSet && !tr.docChanged) return value;
        return { by: null };
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
        // prosemirror-tables' tableEditing grows a cell selection by
        // cells; the other keys leave it to the editor
        if (selection instanceof CellSelection) return false;
        const after = headAfter(view.state);
        if (down !== undefined) {
          const caret = engine.caret(selection.head, after);
          if (!caret) return false;
          goal ??= caret.x;
          const target =
            engine.verticalAt(selection.head, after, down, goal) ??
            // from the first or last line to the start or end
            ({
              node: false,
              pos: down ? Selection.atEnd(view.state.doc).to : 0,
              after: false,
            } satisfies Move);
          const current = goal;
          move(
            view,
            selectionAt(
              view.state,
              target,
              event.shiftKey ? selection.anchor : undefined,
            ),
            "vertical",
            undefined,
            target.after,
          );
          goal = current;
          return true;
        }
        if (event.key === "PageUp" || event.key === "PageDown") {
          return page(view, engine, event.key === "PageDown", event.shiftKey);
        }
        if (event.key === "Home" || event.key === "End") {
          const edge = engine.lineBoundary(
            selection.head,
            after,
            event.key === "End",
          );
          if (edge === null) return false;
          move(
            view,
            selectionAt(
              view.state,
              { node: false, pos: edge.pos },
              event.shiftKey ? selection.anchor : undefined,
            ),
            null,
            undefined,
            edge.after,
          );
          return true;
        }
        return false;
      },
      // the page view scrolls to the caret it paints; without the engine,
      // the editor scrolls to its own
      handleScrollToSelection: () => pageEngine !== null,
    },
  });
};
