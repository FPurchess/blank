import type { Node } from "prosemirror-model";

import {
  type PageLayoutState,
  pageLayoutState,
  pageView,
  type PageViewMode,
  type PageViewport,
  pageViewport,
} from "../state/pageView";
import { pageEngine, type Hit, type PageBox, type PageEngine } from "./engine";
import { type FrameLayout, frameLayout, onDesk, pointOnPage } from "./frames";

// The geometry of the document as the page view shows it, in the window's
// coordinates like getBoundingClientRect: where the caret at a position is,
// the rectangles of a range, the boxes of blocks and tables, and what a point
// hits. The editor's own DOM is hidden (see src/editor/hidden.ts), so
// everything that places itself at the text measures here, from the layout
// the engine made, never from that DOM.

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
  const mode = pageView.value;
  if (
    cached?.state !== state ||
    cached.mode !== mode ||
    cached.width !== viewport.width
  ) {
    cached = {
      state,
      mode,
      width: viewport.width,
      frames: frameLayout(state, mode, viewport.width),
    };
  }
  return { frames: cached.frames, viewport };
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
  const caret = shown?.engine.caret(pos, after);
  if (!shown || !caret) return null;
  return toWindow(shown.frames, shown.viewport, caret);
};

/**
 * caretPage returns the page the caret at `pos` is on, counted from 0
 */
export const caretPage = (pos: number): number | null =>
  pageEngine?.caret(pos)?.page ?? null;

/**
 * rangeRects returns the rectangles of the text from `from` to `to`
 */
export const rangeRects = (from: number, to: number): Box[] => {
  const shown = ready();
  if (!shown) return [];
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
  if (!shown) return [];
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
  if (!shown) return null;
  const { frames, viewport } = shown;
  const point = pointOnPage(
    frames,
    x - viewport.left,
    y - viewport.top + viewport.scrollTop,
  );
  return point ? shown.engine.hit(point.page, point.x, point.y) : null;
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
 * exposeGeometry lets E2E tests measure the pages as the page view shows
 * them, through `window.blankGeometry`, since what is painted has no DOM
 * @param doc the editor's document now
 */
export const exposeGeometry = (doc: () => Node) => {
  Object.assign(window, {
    blankGeometry: {
      caretBox,
      rangeRects,
      blockBoxes,
      hitAt,
      tables: () => tablePositions(doc()).map(({ pos }) => tableGeometry(pos)),
      find: (text: string, index = 0) => findText(doc(), text, index),
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
