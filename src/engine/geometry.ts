import type { Node } from "prosemirror-model";
import { NodeSelection } from "prosemirror-state";
import { TableMap } from "prosemirror-tables";
import type { EditorView } from "prosemirror-view";
import { computed } from "vue";

import {
  type PageLayoutState,
  pageLayoutState,
  pageScrollRequest,
  pageView,
  type PageViewMode,
  type PageViewport,
  pageViewport,
} from "../state/pageView";
import {
  engineless,
  pageEngine,
  type Hit,
  type PageBox,
  type PageEngine,
} from "./engine";
import { cellAt } from "../markdown/tables";
import { type FrameLayout, frameLayout, onDesk, pointOnPage } from "./frames";

// The geometry of the document as the page view shows it, in the window's
// coordinates like getBoundingClientRect: where the caret at a position is,
// the rectangles of a range, the boxes of blocks and tables, and what a point
// hits. The editor's own DOM is hidden (see src/editor/hidden.ts), so
// everything that places itself at the text measures here, from the layout
// the engine made, never from that DOM.
//
// Without the engine, the editor shows the text itself, as before the page
// view: then its own DOM is what the user sees, and the geometry measures it
// (see measured below).

// a box in the window, in CSS pixels
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

// a box of a block on a page, with the page
export type PageBlock = Box & { page: number };

// the part of a table on one page: its rows (without the header rows
// repeated at the top of a page it continues on) and columns
export interface TablePiece {
  page: number;
  box: Box;
  // the first of its rows, counted in the table
  firstRow: number;
  // where each of its rows starts, and where the last ends
  rows: number[];
  // where each column starts, and where the last ends
  columns: number[];
}

export interface TableGeometry {
  // how many rows the table has
  rowCount: number;
  pieces: TablePiece[];
}

let cached: {
  state: PageLayoutState;
  mode: PageViewMode;
  width: number;
  frames: FrameLayout;
} | null = null;

/**
 * framesNow returns where the page view shows the pages, or null while it
 * isn't shown or nothing is laid out
 */
const framesNow = (): {
  frames: FrameLayout;
  viewport: PageViewport;
} | null => {
  const state = pageLayoutState.value;
  const viewport = pageViewport.value;
  if (!state || !viewport) return null;
  return { frames: framesAt(state, pageView.value, viewport.width), viewport };
};

/**
 * framesAt returns where the page view shows the pages of `state` at
 * `width`, the same layout while they stay the same
 */
const framesAt = (
  state: PageLayoutState,
  mode: PageViewMode,
  width: number,
) => {
  if (
    cached?.state !== state ||
    cached.mode !== mode ||
    cached.width !== width
  ) {
    cached = { state, mode, width, frames: frameLayout(state, mode, width) };
  }
  return cached.frames;
};

// the page view's width alone, which notifies only when it changes, not on
// every scroll as pageViewport does
const viewWidth = computed(() => pageViewport.value?.width ?? null);

/**
 * deskFrames returns where the page view shows the pages, like framesNow,
 * without following the scrolling: a computed that measures with it isn't
 * worked out again on every scroll
 */
const deskFrames = (): FrameLayout | null => {
  const state = pageLayoutState.value;
  const width = viewWidth.value;
  return state && width !== null
    ? framesAt(state, pageView.value, width)
    : null;
};

// the editor, which the geometry measures without the engine
let editorView: EditorView | null = null;

/**
 * setGeometryView sets the editor the geometry measures while there is no
 * engine, when it shows the text itself
 */
export const setGeometryView = (view: EditorView | null) => {
  editorView = view;
};

// the editor to measure, while it shows the text itself
const measured = () => (engineless() ? editorView : null);

const boxOf = ({ left, top, right, bottom }: Box): Box => ({
  left,
  top,
  right,
  bottom,
});

// the smallest box around all of `boxes`
const around = (boxes: Box[]): Box => ({
  left: Math.min(...boxes.map((box) => box.left)),
  top: Math.min(...boxes.map((box) => box.top)),
  right: Math.max(...boxes.map((box) => box.right)),
  bottom: Math.max(...boxes.map((box) => box.bottom)),
});

// the editor's DOM measures positions it doesn't show (e.g. inside a node
// view) with an error
const tryMeasure = <T>(measure: () => T, fallback: T): T => {
  try {
    return measure();
  } catch {
    return fallback;
  }
};

const shownCaret = (view: EditorView, pos: number, after: boolean) =>
  tryMeasure<Box | null>(() => {
    const { left, top, bottom } = view.coordsAtPos(pos, after ? -1 : 1);
    return { left, top, right: left, bottom };
  }, null);

const shownRange = (view: EditorView, from: number, to: number) =>
  tryMeasure<Box[]>(() => {
    const start = view.domAtPos(from);
    const end = view.domAtPos(to);
    const range = document.createRange();
    range.setStart(start.node, start.offset);
    range.setEnd(end.node, end.offset);
    return [...range.getClientRects()].map(boxOf);
  }, []);

const shownBlocks = (view: EditorView, from: number, to: number) => {
  const boxes: Box[] = [];
  view.state.doc.nodesBetween(from, to, (_node, pos) => {
    const dom = view.nodeDOM(pos);
    if (!(dom instanceof Element)) return true;
    boxes.push(boxOf(dom.getBoundingClientRect()));
    return false;
  });
  return boxes.length ? [{ ...around(boxes), page: 0 }] : [];
};

const shownTable = (view: EditorView, pos: number): TableGeometry | null => {
  const table = view.state.doc.nodeAt(pos);
  const dom = view.nodeDOM(pos);
  if (table?.type.name !== "table" || !(dom instanceof Element)) return null;
  const map = TableMap.get(table);
  const start = pos + 1;
  const rows: number[] = [];
  let bottom = 0;
  let rowPos = start;
  table.forEach((row) => {
    const element = view.nodeDOM(rowPos);
    if (element instanceof Element) {
      const box = element.getBoundingClientRect();
      rows.push(box.top);
      bottom = box.bottom;
    }
    rowPos += row.nodeSize;
  });
  const whole = (dom.querySelector("table") ?? dom).getBoundingClientRect();
  const columns: number[] = [];
  for (let column = 0; column < map.width; column++) {
    let left = columns[column - 1] ?? whole.left;
    for (let row = 0; row < map.height; row++) {
      const offset = cellAt(map, row, column);
      if (map.findCell(offset).left !== column) continue;
      const cell = view.nodeDOM(start + offset);
      if (cell instanceof Element) left = cell.getBoundingClientRect().left;
      break;
    }
    columns.push(left);
  }
  columns.push(whole.right);
  if (!rows.length) rows.push(whole.top);
  rows.push(bottom || whole.bottom);
  return {
    rowCount: map.height,
    pieces: [
      {
        page: 0,
        box: {
          left: columns[0],
          right: whole.right,
          top: rows[0],
          bottom: rows[rows.length - 1],
        },
        firstRow: 0,
        rows,
        columns,
      },
    ],
  };
};

const shownHit = (view: EditorView, x: number, y: number): Hit | null => {
  const found = tryMeasure(() => view.posAtCoords({ left: x, top: y }), null);
  if (!found) return null;
  if (found.inside >= 0) {
    const node = view.state.doc.nodeAt(found.inside);
    if (node?.isLeaf && !node.isText && NodeSelection.isSelectable(node))
      return { node: true, pos: found.inside };
  }
  return { node: false, pos: found.pos };
};

const ready = (): {
  engine: PageEngine;
  frames: FrameLayout;
  viewport: PageViewport;
} | null => {
  const shown = framesNow();
  const engine = pageEngine;
  return shown && engine ? { engine, ...shown } : null;
};

/**
 * toWindow returns where a box of a page is in the window
 */
const toWindow = (
  frames: FrameLayout,
  viewport: PageViewport,
  rect: PageBox,
): Box | null => {
  const placed = onDesk(frames, rect);
  if (!placed) return null;
  const left = viewport.left + placed.left;
  const top = viewport.top + placed.top - viewport.scrollTop;
  return {
    left,
    top,
    right: left + placed.width,
    bottom: top + placed.height,
  };
};

/**
 * caretBox returns the caret at `pos` in the window, as wide as nothing
 * @param after for a position at a line break, the end of the line before
 */
export const caretBox = (pos: number, after = false): Box | null => {
  const shown = ready();
  const view = shown ? null : measured();
  if (view) return shownCaret(view, pos, after);
  const caret = shown?.engine.caret(pos, after);
  if (!shown || !caret) return null;
  return toWindow(shown.frames, shown.viewport, caret);
};

/**
 * pageBoxInWindow returns where a box of a page, in points, is in the window
 */
export const pageBoxInWindow = (rect: PageBox): Box | null => {
  const shown = ready();
  return shown ? toWindow(shown.frames, shown.viewport, rect) : null;
};

/**
 * caretPage returns the page the caret at `pos` is on, counted from 0
 */
export const caretPage = (pos: number): number | null =>
  pageEngine?.caret(pos)?.page ?? (measured() ? 0 : null);

/**
 * rangeRects returns the rectangles of the text from `from` to `to`
 */
export const rangeRects = (from: number, to: number): Box[] => {
  const shown = ready();
  if (!shown) {
    const view = measured();
    return view ? shownRange(view, from, to) : [];
  }
  return shown.engine
    .selection(from, to)
    .flatMap((rect) => toWindow(shown.frames, shown.viewport, rect) ?? []);
};

/**
 * blockBoxes returns the boxes of the blocks from `from` to `to`, e.g. of a
 * node, one for each page they are on
 */
export const blockBoxes = (from: number, to: number): PageBlock[] => {
  const shown = ready();
  if (!shown) {
    const view = measured();
    return view ? shownBlocks(view, from, to) : [];
  }
  return shown.engine.boxes(from, to).flatMap((rect) => {
    const box = toWindow(shown.frames, shown.viewport, rect);
    return box ? [{ ...box, page: rect.page }] : [];
  });
};

/**
 * tableGeometry returns the table at `pos` as the page view shows it, one
 * piece for each page it is on
 */
export const tableGeometry = (pos: number): TableGeometry | null => {
  const shown = ready();
  const view = shown ? null : measured();
  if (view) return shownTable(view, pos);
  const grid = shown?.engine.tableGrid(pos);
  if (!shown || !grid) return null;
  const { frames, viewport } = shown;
  const x = (page: number, value: number) =>
    toWindow(frames, viewport, { page, x: value, y: 0, width: 0, height: 0 })
      ?.left ?? 0;
  const y = (page: number, value: number) =>
    toWindow(frames, viewport, { page, x: 0, y: value, width: 0, height: 0 })
      ?.top ?? 0;
  const pieces: TablePiece[] = [];
  let rowCount = 0;
  for (const row of grid.rows) {
    if (row.repeat) continue;
    rowCount = Math.max(rowCount, row.row + 1);
    let piece = pieces[pieces.length - 1];
    if (piece?.page !== row.page) {
      const columns = grid.columns.map((value) => x(row.page, value));
      piece = {
        page: row.page,
        box: {
          left: columns[0],
          right: columns[columns.length - 1],
          top: y(row.page, row.y),
          bottom: y(row.page, row.y),
        },
        firstRow: row.row,
        rows: [y(row.page, row.y)],
        columns,
      };
      pieces.push(piece);
    }
    const bottom = y(row.page, row.y + row.height);
    piece.rows.push(bottom);
    piece.box.bottom = bottom;
  }
  return { rowCount, pieces };
};

/**
 * hitAt returns the position at a point of the window: a caret position in
 * text, or a node without text; null where no page is
 */
export const hitAt = (x: number, y: number): Hit | null => {
  const shown = ready();
  if (!shown) {
    const view = measured();
    return view ? shownHit(view, x, y) : null;
  }
  const { frames, viewport } = shown;
  const point = pointOnPage(
    frames,
    x - viewport.left,
    y - viewport.top + viewport.scrollTop,
  );
  return point ? shown.engine.hit(point.page, point.x, point.y) : null;
};

/**
 * pageAt returns the page a point of the window is on, or nearest to, and
 * the positions its blocks start and end at; null while no pages show
 */
export const pageAt = (
  x: number,
  y: number,
): { page: number; from: number; to: number } | null => {
  const shown = ready();
  if (!shown) return null;
  const { frames, viewport } = shown;
  const point = pointOnPage(
    frames,
    x - viewport.left,
    y - viewport.top + viewport.scrollTop,
  );
  const span = point && shown.engine.pageSpan(point.page);
  return point && span ? { page: point.page, ...span } : null;
};

/**
 * tablePositions returns where the tables of a document are, in order
 */
export const tablePositions = (doc: Node) => {
  const found: { node: Node; pos: number }[] = [];
  doc.descendants((node, pos) => {
    if (node.type.name !== "table") return true;
    found.push({ node, pos });
    return false;
  });
  return found;
};

/**
 * scrollTops returns where the text at each of `positions` starts, in the
 * coordinates of what scrolls: the page view's desk, or the document while
 * the editor shows the text itself; null for a position that isn't laid out.
 * It doesn't follow the scrolling, so it's worked out once per layout.
 */
export const scrollTops = (positions: readonly number[]): (number | null)[] => {
  const view = measured();
  if (view)
    return positions.map((pos) => {
      const box = shownCaret(view, pos, false);
      return box ? box.top + window.scrollY : null;
    });
  const frames = deskFrames();
  const engine = pageEngine;
  if (!frames || !engine) return positions.map(() => null);
  return positions.map((pos) => {
    const caret = engine.caret(pos);
    return caret ? (onDesk(frames, caret)?.top ?? null) : null;
  });
};

/**
 * pageTops returns where each page starts on the page view's desk, in order;
 * null while no pages show, as without the engine. Like scrollTops, it
 * doesn't follow the scrolling.
 */
export const pageTops = (): number[] | null =>
  measured() ? null : (deskFrames()?.frames.map((frame) => frame.top) ?? null);

/**
 * scrollState returns how far what shows the text is scrolled, how high it
 * is and how far it can scroll; null while nothing shows it
 */
export const scrollState = (): {
  top: number;
  height: number;
  max: number;
} | null => {
  if (measured()) {
    const height = window.innerHeight;
    return {
      top: window.scrollY,
      height,
      max: Math.max(0, document.documentElement.scrollHeight - height),
    };
  }
  const viewport = pageViewport.value;
  const frames = deskFrames();
  if (!viewport || !frames) return null;
  return {
    top: viewport.scrollTop,
    height: viewport.height,
    max: Math.max(0, frames.height - viewport.height),
  };
};

/**
 * scrollToText scrolls so that the text at `pos` starts `at` pixels below the
 * top of the view, as far as the view scrolls, without moving the selection
 */
export const scrollToText = (pos: number, at: number) => {
  const view = measured();
  if (view) {
    const box = shownCaret(view, pos, false);
    if (box) window.scrollBy({ top: box.top - at });
    return;
  }
  const caret = pageEngine?.caret(pos);
  // a new request each time, which the page view serves once
  if (caret) pageScrollRequest.value = { ...caret, at };
};

/**
 * scrollViewBy scrolls what shows the text by `dy` pixels, e.g. for a wheel
 * turned over the outline
 */
export const scrollViewBy = (dy: number) => {
  if (measured()) window.scrollBy({ top: dy });
  else document.getElementById("page-view")?.scrollBy({ top: dy });
};

/**
 * exposeGeometry lets E2E tests measure the pages as the page view shows
 * them, through `window.blankGeometry`, since what is painted has no DOM
 * @param view the editor
 */
export const exposeGeometry = (view: EditorView) => {
  const doc = () => view.state.doc;
  Object.assign(window, {
    blankGeometry: {
      // the end of the content of an element of the hidden editor, e.g.
      // where a click right of its text puts the caret
      endOf: (element: Element) =>
        view.posAtDOM(element, element.childNodes.length),
      caretBox,
      rangeRects,
      blockBoxes,
      hitAt,
      // where the text at positions starts, and how far the view scrolled,
      // e.g. where the outline's jumps land
      scrollTops,
      scrollState,
      tables: () => tablePositions(doc()).map(({ pos }) => tableGeometry(pos)),
      find: (text: string, index = 0) => findText(doc(), text, index),
      // whether the engine is still laying out the rest of a long document
      laying: () => pageEngine?.laying ?? false,
    },
  });
};

/**
 * findText returns the position where the `index`th occurrence of `text`
 * starts within a textblock of `doc`, or -1
 */
export const findText = (doc: Node, text: string, index = 0) => {
  let found = -1;
  let seen = 0;
  doc.descendants((node, pos) => {
    if (found >= 0) return false;
    if (!node.isTextblock) return true;
    // the block's text, and the position of each of its characters
    let content = "";
    const positions: number[] = [];
    node.forEach((child, offset) => {
      if (!child.isText) return;
      content += child.text;
      for (let i = 0; i < child.text!.length; i++)
        positions.push(pos + 1 + offset + i);
    });
    for (
      let at = content.indexOf(text);
      at >= 0;
      at = content.indexOf(text, at + 1)
    ) {
      if (seen++ === index) {
        found = positions[at];
        break;
      }
    }
    return false;
  });
  return found;
};

/**
 * viewBox returns the box of the page view in the window
 */
export const viewBox = (): Box | null => {
  const viewport = pageViewport.value;
  if (!viewport) return null;
  return {
    left: viewport.left,
    top: viewport.top,
    right: viewport.left + viewport.width,
    bottom: viewport.top + viewport.height,
  };
};
