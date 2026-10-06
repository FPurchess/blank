import { roundPercent } from "../markdown/tables";
import type { Anchor, Point, Span, TableHandlesState } from "../state";
import { dropAt, movedBy } from "./dragModel";
import type { Rect } from "./rect";

// What the handles of the table under the mouse (TableHandles.vue) show and
// do, without their DOM: which row, column or line the mouse is over, where
// each handle goes, and what a drag leads to. The table's rows and columns
// come from src/editor/plugins/tables/handles.ts.

// how near a line between rows or columns the mouse shows the "+" to insert
// one there, and how near the edge of the table, in px
const INSERT_NEAR = 7;
const EDGE_NEAR = 16;
// how far the mouse moves before a press becomes a drag, in px
export const DRAG_AFTER = 4;
// how narrow resizing makes a column, in px
const MIN_COLUMN = 32;
// how far dragging the right edge goes for each column it adds, in px
const COLUMN_STEP = 60;
// how soon a second press on a line is a double click, in ms
export const DOUBLE_CLICK = 400;

export interface Hover {
  // the row and column under the mouse
  row: number | null;
  column: number | null;
  // the line between rows or columns where the "+" inserts one
  insertRow: number | null;
  insertColumn: number | null;
}

export const NO_HOVER: Hover = {
  row: null,
  column: null,
  insertRow: null,
  insertColumn: null,
};

export const sameHover = (a: Hover, b: Hover) =>
  a.row === b.row &&
  a.column === b.column &&
  a.insertRow === b.insertRow &&
  a.insertColumn === b.insertColumn;

/**
 * indexAt returns the index of the span of `lines` (where each starts, and
 * where the last ends) that holds `value`, or null
 */
const indexAt = (lines: readonly number[], value: number) => {
  for (let i = 0; i < lines.length - 1; i++) {
    if (value >= lines[i] && value < lines[i + 1]) return i;
  }
  return null;
};

/**
 * nearestLine returns the index of the line of `lines` nearest to `value`,
 * among those from `min` on, if it is within `near`
 */
const nearestLine = (
  lines: readonly number[],
  value: number,
  near: number,
  min = 0,
) => {
  let best: number | null = null;
  for (let i = min; i < lines.length; i++) {
    const distance = Math.abs(lines[i] - value);
    if (
      distance <= near &&
      (best === null || distance < Math.abs(lines[best] - value))
    ) {
      best = i;
    }
  }
  return best;
};

/**
 * hoverAt returns which handles the mouse at `point` shows for `table`
 */
export const hoverAt = (table: TableHandlesState, point: Point): Hover => {
  const { box, visible, rows, columns, headerRows, headerColumn, firstRow } =
    table;
  const x = Math.min(Math.max(point.x, visible.left), visible.right - 1);
  const y = Math.min(Math.max(point.y, box.top), box.bottom - 1);
  // nothing goes before the header row or header column
  const line =
    Math.abs(point.x - visible.left) <= EDGE_NEAR
      ? nearestLine(
          rows,
          point.y,
          INSERT_NEAR,
          headerRows > 0 ? Math.max(0, 1 - firstRow) : 0,
        )
      : null;
  const insertRow = line === null ? null : line + firstRow;
  const insertColumn =
    Math.abs(point.y - box.top) <= EDGE_NEAR
      ? nearestLine(columns, point.x, INSERT_NEAR, headerColumn ? 1 : 0)
      : null;
  const row = indexAt(rows, y);
  return {
    row: row === null ? null : row + firstRow,
    column: indexAt(columns, x),
    insertRow,
    insertColumn: insertRow === null ? insertColumn : null,
  };
};

/**
 * lastPiece returns whether the rows shown are the table's last ones, where
 * its bottom edge is
 */
const lastPiece = (table: TableHandlesState) =>
  table.firstRow + table.rows.length - 1 >= table.rowCount;

/**
 * lineOf returns where the line before row `index` of the table is, within
 * the rows shown
 */
const lineOf = (table: TableHandlesState, index: number) =>
  table.rows[
    Math.min(Math.max(index - table.firstRow, 0), table.rows.length - 1)
  ];

/**
 * resized returns the column widths in percent after the line before column
 * `index` moved by `dx` px in a table `width` px wide: the columns on both
 * sides of it share their width anew, keeping at least MIN_COLUMN px each
 */
export const resized = (
  percents: readonly number[],
  index: number,
  dx: number,
  width: number,
): number[] => {
  const px = percents.map((percent) => (percent / 100) * width);
  const pair = px[index - 1] + px[index];
  const left = Math.min(
    Math.max(px[index - 1] + dx, MIN_COLUMN),
    pair - MIN_COLUMN,
  );
  px[index - 1] = left;
  px[index] = pair - left;
  return px.map((value) => roundPercent((value / width) * 100));
};

/**
 * growStep returns how far dragging an edge goes for each column or row it
 * adds: a fixed step for columns, since a table as wide as the page has
 * wide ones, and the average height for rows
 */
const growStep = (lines: readonly number[], columns: boolean) =>
  columns
    ? COLUMN_STEP
    : (lines[lines.length - 1] - lines[0]) / (lines.length - 1);

/**
 * countAt returns how many columns or rows moving the table's end, the last
 * of `lines`, by `delta` px leaves: one more per step it grows, and one less
 * for each one whose middle it passes as it shrinks
 */
const countAt = (lines: readonly number[], delta: number, step: number) => {
  const have = lines.length - 1;
  if (delta >= 0) return have + Math.round(delta / step);
  const end = lines[have] + delta;
  let count = 0;
  while (count < have && (lines[count] + lines[count + 1]) / 2 < end) count++;
  return count;
};

/**
 * sizeAt returns how many columns and rows dragging the table's edges by
 * `dx` and `dy` px gives, down to the smallest the table can shrink to
 */
export const sizeAt = (table: TableHandlesState, dx: number, dy: number) => ({
  cols: Math.max(
    table.smallest.cols,
    countAt(table.columns, dx, growStep(table.columns, true)),
  ),
  rows: Math.max(
    table.smallest.rows,
    table.firstRow + countAt(table.rows, dy, growStep(table.rows, false)),
  ),
});

/**
 * extent returns where the table's end would be with `count` rows or
 * columns: at a line it has, or beyond its end by a step for each one more
 */
const extent = (lines: readonly number[], count: number, step: number) => {
  const have = lines.length - 1;
  if (count <= have) return lines[count];
  return lines[have] + (count - have) * step;
};

export type Axis = "rows" | "columns";

// a drag of a handle, from where it started to where the mouse is now: the
// drop uses that, since not every webview puts the mouse's position on the
// pointerup event
export type Drag = { start: Point; at: Point } & (
  | { kind: "move"; axis: Axis; span: Span; moving: boolean }
  | { kind: "resize"; index: number }
  | { kind: "edge"; horizontal: boolean; vertical: boolean }
);

// what a drag leads to if it ends here
type Outcome =
  | { kind: "move"; line: number; by: number }
  | { kind: "resize"; widths: number[] }
  | { kind: "edge"; cols: number; rows: number };

/**
 * firstMovable returns the first row or column that moves: rows move below
 * the header rows, and a header column stays first
 */
const firstMovable = (table: TableHandlesState, axis: Axis) =>
  axis === "rows" ? table.headerRows : table.headerColumn ? 1 : 0;

/**
 * outcomeOf returns what `drag` leads to in `table` if it ends now
 */
export const outcomeOf = (drag: Drag, table: TableHandlesState): Outcome => {
  const dx = drag.at.x - drag.start.x;
  const dy = drag.at.y - drag.start.y;
  if (drag.kind === "move") {
    const rows = drag.axis === "rows";
    const lines = rows ? table.rows : table.columns;
    // the rows shown start at firstRow
    const offset = rows ? table.firstRow : 0;
    const local = (index: number) =>
      Math.min(Math.max(index - offset, 0), lines.length - 1);
    const line =
      offset +
      dropAt(
        lines,
        [local(drag.span[0]), local(drag.span[1])],
        rows ? drag.at.y : drag.at.x,
        Math.max(0, firstMovable(table, drag.axis) - offset),
      );
    return { kind: "move", line, by: movedBy(drag.span, line) };
  }
  if (drag.kind === "resize") {
    const width = table.box.right - table.box.left;
    return {
      kind: "resize",
      widths: resized(table.percents, drag.index, dx, width),
    };
  }
  return {
    kind: "edge",
    ...sizeAt(table, drag.horizontal ? dx : 0, drag.vertical ? dy : 0),
  };
};

/**
 * selectedSpan returns the selected rows or columns if they are whole rows or
 * columns and hold `index`
 */
const selectedSpan = (
  table: TableHandlesState,
  axis: Axis,
  index: number,
): Span | null => {
  if (!table.selected) return null;
  const [from, to] = table.selected[axis];
  const [acrossFrom, acrossTo] =
    table.selected[axis === "rows" ? "columns" : "rows"];
  const across = axis === "rows" ? table.columns.length - 1 : table.rowCount;
  const whole = acrossFrom === 0 && acrossTo === across;
  return whole && index >= from && index < to ? [from, to] : null;
};

/**
 * spanOf returns the rows or columns the handle at `index` works on: the
 * selected ones if it is among them, just its own otherwise
 */
export const spanOf = (
  table: TableHandlesState,
  axis: Axis,
  index: number,
): Span => selectedSpan(table, axis, index) ?? [index, index + 1];

/**
 * anchorOf returns the box of a handle as the anchor of the menu it opens
 */
export const anchorOf = ({ left, top, height }: Rect): Anchor => ({
  left,
  top,
  bottom: top + height,
});

interface Handles {
  rowGrip: Rect | null;
  columnGrip: Rect | null;
  // whether the grip's row or column is among the selected ones
  rowSelected: boolean;
  columnSelected: boolean;
  insert: Rect | null;
  insertLine: Rect | null;
  // the lines between columns, which resize them, by the column after them
  // less one
  resizers: (Rect | null)[];
  right: Rect | null;
  bottom: Rect | null;
  corner: Rect | null;
}

/**
 * hidesHandles returns whether `drag` hides the handles: once it moves rows
 * or columns, whose new place the preview shows. A press that hasn't moved
 * yet, e.g. a click on a grip, and the drag of a line or an edge keep them,
 * for the hover the drag started at, also when the table is published again
 * meanwhile (e.g. the view scrolled), where they follow it.
 */
export const hidesHandles = (drag: Drag | null) =>
  drag?.kind === "move" && drag.moving;

/**
 * handlesOf returns where the handles of `table` go for the mouse's `hover`
 * @param dragging whether a drag hides them, see hidesHandles
 */
export const handlesOf = (
  table: TableHandlesState,
  hover: Hover,
  dragging: boolean,
): Handles => {
  const { box, visible, columns } = table;
  const height = box.bottom - box.top;
  const across = visible.right - visible.left;

  // the handles of the row and column under the mouse; the "+" hides them,
  // so it stands out
  const inserting = hover.insertRow !== null || hover.insertColumn !== null;
  // the hover stays as it was while a handle is dragged, so the table may
  // have been published again with fewer rows or columns since
  const shownRow =
    hover.row !== null &&
    hover.row >= table.firstRow &&
    hover.row < table.firstRow + table.rows.length - 1;
  const shownColumn =
    hover.column !== null && hover.column < columns.length - 1;
  const row = !dragging && !inserting && shownRow ? hover.row : null;
  const column = !dragging && !inserting && shownColumn ? hover.column : null;
  const rowGrip =
    row === null
      ? null
      : {
          left: visible.left - 6,
          top: lineOf(table, row) + 6,
          width: 12,
          height: Math.max(lineOf(table, row + 1) - lineOf(table, row) - 12, 8),
        };
  const columnLeft =
    column === null ? 0 : Math.max(columns[column], visible.left);
  const columnRight =
    column === null ? 0 : Math.min(columns[column + 1], visible.right);
  const columnGrip =
    column === null || columnRight - columnLeft <= 16
      ? null
      : {
          left: columnLeft + 6,
          top: box.top - 6,
          width: columnRight - columnLeft - 12,
          height: 12,
        };

  // the "+" and the line where it inserts
  const y = hover.insertRow === null ? null : lineOf(table, hover.insertRow);
  const x = hover.insertColumn === null ? null : columns[hover.insertColumn];
  const columnShown = x !== null && x >= visible.left && x <= visible.right;
  let insert: Rect | null = null;
  let insertLine: Rect | null = null;
  if (!dragging && y !== null) {
    insert = { left: visible.left - 9, top: y - 9, width: 18, height: 18 };
    insertLine = { left: visible.left, top: y - 1, width: across, height: 2 };
  } else if (!dragging && columnShown) {
    insert = { left: x - 9, top: box.top - 9, width: 18, height: 18 };
    insertLine = { left: x - 1, top: box.top, width: 2, height };
  }

  // the lines between columns, which resize them
  const resizers = columns
    .slice(1, -1)
    .map((line) =>
      !dragging && line > visible.left && line < visible.right
        ? { left: line - 4, top: box.top, width: 8, height }
        : null,
    );

  // the edges, which add and drop columns and rows; the bottom one on the
  // page the table ends on
  const rightShown = !dragging && box.right <= visible.right + 1;
  const bottomShown = !dragging && lastPiece(table);
  return {
    rowGrip,
    columnGrip,
    rowSelected: row !== null && !!selectedSpan(table, "rows", row),
    columnSelected: column !== null && !!selectedSpan(table, "columns", column),
    insert,
    insertLine,
    resizers,
    right: rightShown
      ? { left: box.right - 3, top: box.top, width: 9, height: height - 6 }
      : null,
    bottom: bottomShown
      ? {
          left: visible.left,
          top: box.bottom - 3,
          width: across - 6,
          height: 9,
        }
      : null,
    corner:
      rightShown && bottomShown
        ? { left: box.right - 5, top: box.bottom - 5, width: 12, height: 12 }
        : null,
  };
};

export interface Preview {
  // where moved rows or columns land, or where the resized line goes
  guide: Rect | null;
  // the rows or columns being moved
  dragged: Rect | null;
  // the table's new size while an edge is dragged, and what it reads
  ghost: Rect | null;
  size: string;
}

export const NO_PREVIEW: Preview = {
  guide: null,
  dragged: null,
  ghost: null,
  size: "",
};

/**
 * previewOf returns what `drag` shows of what it leads to: where rows or
 * columns land, where the line between columns goes, or the table's new size
 */
export const previewOf = (drag: Drag, table: TableHandlesState): Preview => {
  const { box, visible, rows, columns } = table;
  const height = box.bottom - box.top;
  const outcome = outcomeOf(drag, table);
  if (outcome.kind === "move" && drag.kind === "move") {
    const [from, to] = drag.span;
    if (drag.axis === "rows") {
      const across = visible.right - visible.left;
      return {
        ...NO_PREVIEW,
        guide: {
          left: visible.left,
          top: lineOf(table, outcome.line) - 2,
          width: across,
          height: 4,
        },
        dragged: {
          left: visible.left,
          top: lineOf(table, from),
          width: across,
          height: lineOf(table, to) - lineOf(table, from),
        },
      };
    }
    const left = Math.max(columns[from], visible.left);
    return {
      ...NO_PREVIEW,
      guide: {
        left: columns[outcome.line] - 2,
        top: box.top,
        width: 4,
        height,
      },
      dragged: {
        left,
        top: box.top,
        width: Math.min(columns[to], visible.right) - left,
        height,
      },
    };
  }
  if (outcome.kind === "resize" && drag.kind === "resize") {
    const before = outcome.widths
      .slice(0, drag.index)
      .reduce((sum, width) => sum + width, 0);
    const x = box.left + ((box.right - box.left) * before) / 100;
    return {
      ...NO_PREVIEW,
      guide: { left: x - 1, top: box.top, width: 2, height },
    };
  }
  if (outcome.kind !== "edge") return NO_PREVIEW;
  const width =
    extent(columns, outcome.cols, growStep(columns, true)) - box.left;
  const tall =
    extent(rows, outcome.rows - table.firstRow, growStep(rows, false)) -
    box.top;
  return {
    ...NO_PREVIEW,
    ghost: { left: box.left, top: box.top, width, height: tall },
    size: `${outcome.cols} × ${outcome.rows}`,
  };
};
