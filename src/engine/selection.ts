import { NodeSelection, type Selection } from "prosemirror-state";
import { CellSelection, TableMap } from "prosemirror-tables";

import type { PageRect } from "../state/pageView";
import type { PageEngine } from "./engine";

// What the page view shows of a selection, from the engine's layout: the
// caret, the rectangles of a range or of selected cells, or the boxes of a
// selected node.

export interface ShownSelection {
  caret: PageRect | null;
  rects: PageRect[];
  nodes: PageRect[];
}

/**
 * cellRects returns the rectangles of the selected cells: one for each run
 * of their rows on a page
 */
export const cellRects = (
  engine: PageEngine,
  selection: CellSelection,
): PageRect[] => {
  const table = selection.$anchorCell.node(-1);
  const tableStart = selection.$anchorCell.start(-1);
  const grid = engine.tableGrid(tableStart - 1);
  if (!grid) return [];
  const map = TableMap.get(table);
  const { left, right, top, bottom } = map.rectBetween(
    selection.$anchorCell.pos - tableStart,
    selection.$headCell.pos - tableStart,
  );
  const x = grid.columns[left];
  const width = grid.columns[right] - x;
  const rects: PageRect[] = [];
  for (const row of grid.rows) {
    if (row.repeat || row.row < top || row.row >= bottom) continue;
    const last = rects[rects.length - 1];
    if (last?.page === row.page) {
      last.height = row.y + row.height - last.y;
    } else {
      rects.push({ page: row.page, x, y: row.y, width, height: row.height });
    }
  }
  return rects;
};

/**
 * shownSelection returns what the page view shows of `selection`
 */
export const shownSelection = (
  engine: PageEngine,
  selection: Selection,
): ShownSelection => {
  if (selection instanceof CellSelection) {
    return { caret: null, rects: cellRects(engine, selection), nodes: [] };
  }
  if (selection instanceof NodeSelection) {
    return {
      caret: null,
      rects: [],
      nodes: engine.boxes(selection.from, selection.to),
    };
  }
  if (selection.empty) {
    return { caret: engine.caret(selection.head), rects: [], nodes: [] };
  }
  return {
    caret: null,
    rects: engine.selection(selection.from, selection.to),
    nodes: [],
  };
};
