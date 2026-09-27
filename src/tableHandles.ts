import { roundPercent } from "./markdown/tables";
import { uiRoot } from "./uiRoot";
import { type Span, tableHandles, type TableHandlesState } from "./state";

// The handles of the table under the mouse, see
// src/editor/plugins/tables/handles.ts: a handle on the left edge of the row
// and the top edge of the column under the mouse (click: select and open the
// table menu, drag: move), a "+" on the edge between two rows or columns
// (click: insert one there), the lines between columns (drag: resize,
// double click: widths by content again) and the table's right and bottom
// edges and corner (drag: add or drop columns and rows).

const HANDLES_ID = "table-handles";
// how near a line between rows or columns the mouse shows the "+" to insert
// one there, and how near the edge of the table, in px
const INSERT_NEAR = 7;
const EDGE_NEAR = 16;
// how far the mouse moves before a press becomes a drag, in px
const DRAG_AFTER = 4;
// how narrow resizing makes a column, in px
const MIN_COLUMN = 32;
// how far dragging the right edge goes for each column it adds, in px
const COLUMN_STEP = 60;
// how soon a second press on a line is a double click, in ms
const DOUBLE_CLICK = 400;

export interface Point {
  x: number;
  y: number;
}

export interface Hover {
  // the row and column under the mouse
  row: number | null;
  column: number | null;
  // the line between rows or columns where the "+" inserts one
  insertRow: number | null;
  insertColumn: number | null;
}

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
  const { box, visible, rows, columns, headerRows, headerColumn } = table;
  const x = Math.min(Math.max(point.x, visible.left), visible.right - 1);
  const y = Math.min(Math.max(point.y, box.top), box.bottom - 1);
  // nothing goes before the header row or header column
  const insertRow =
    Math.abs(point.x - box.left) <= EDGE_NEAR
      ? nearestLine(rows, point.y, INSERT_NEAR, headerRows > 0 ? 1 : 0)
      : null;
  const insertColumn =
    Math.abs(point.y - box.top) <= EDGE_NEAR
      ? nearestLine(columns, point.x, INSERT_NEAR, headerColumn ? 1 : 0)
      : null;
  return {
    row: indexAt(rows, y),
    column: indexAt(columns, x),
    insertRow,
    insertColumn: insertRow === null ? insertColumn : null,
  };
};

/**
 * dropAt returns the line of `lines` where rows or columns dragged from
 * `span` land for the mouse at `value`: not within them, and not before
 * `min`, e.g. the header rows
 */
export const dropAt = (
  lines: readonly number[],
  [from, to]: Span,
  value: number,
  min: number,
) => {
  let best = from;
  for (let i = Math.max(min, 0); i < lines.length; i++) {
    if (i > from && i < to) continue;
    if (Math.abs(lines[i] - value) < Math.abs(lines[best] - value)) best = i;
  }
  return best;
};

/**
 * movedBy returns by how many rows or columns dropping `span` at the line
 * `line` moves it
 */
export const movedBy = ([from, to]: Span, line: number) =>
  line < from ? line - from : line > to ? line - to : 0;

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
    countAt(table.rows, dy, growStep(table.rows, false)),
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

/**
 * element creates an element of `className` in `parent`
 */
const element = <K extends keyof HTMLElementTagNameMap>(
  parent: HTMLElement,
  tag: K,
  className: string,
) => {
  const child = document.createElement(tag);
  child.className = className;
  parent.append(child);
  return child;
};

/**
 * place puts `target` at the viewport box `left`, `top`, `width`, `height`,
 * or hides it for null
 */
const place = (
  target: HTMLElement,
  box: { left: number; top: number; width: number; height: number } | null,
) => {
  target.hidden = !box;
  if (!box) return;
  target.style.left = `${box.left}px`;
  target.style.top = `${box.top}px`;
  target.style.width = `${box.width}px`;
  target.style.height = `${box.height}px`;
};

type Axis = "rows" | "columns";

// a drag of a handle, from where it started to where the mouse is now: the
// drop uses that, since not every webview puts the mouse's position on the
// pointerup event
type Drag = { start: Point; at: Point } & (
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
    const line = dropAt(
      rows ? table.rows : table.columns,
      drag.span,
      rows ? drag.at.y : drag.at.x,
      firstMovable(table, drag.axis),
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
 * bootTableHandles renders the handles of the table the mouse is over and
 * lets the mouse use them
 * @returns a function that removes them
 */
export const bootTableHandles = () => {
  const root = document.createElement("div");
  root.id = HANDLES_ID;
  root.className = "table-handles";
  root.setAttribute("aria-hidden", "true");
  uiRoot().append(root);

  const rowGrip = element(root, "div", "grip row");
  const columnGrip = element(root, "div", "grip column");
  const insert = element(root, "div", "insert");
  const insertLine = element(root, "div", "insert-line");
  const resizers = element(root, "div", "resizers");
  const right = element(root, "div", "edge right");
  const bottom = element(root, "div", "edge bottom");
  const corner = element(root, "div", "edge corner");
  const guide = element(root, "div", "guide");
  const dragged = element(root, "div", "dragged");
  const ghost = element(root, "div", "ghost");
  const size = element(ghost, "span", "size");

  const nothing: Hover = {
    row: null,
    column: null,
    insertRow: null,
    insertColumn: null,
  };
  let table: TableHandlesState | null = null;
  let pointer: Point = { x: -1, y: -1 };
  let hover = nothing;
  let drag: Drag | null = null;
  // the line between columns pressed last, for double clicks
  let lastPress: { index: number; time: number } | null = null;

  /**
   * selectedSpan returns the selected rows or columns if they are whole
   * rows or columns and hold `index`
   */
  const selectedSpan = (axis: Axis, index: number): Span | null => {
    if (!table?.selected) return null;
    const [from, to] = table.selected[axis];
    const [acrossFrom, acrossTo] =
      table.selected[axis === "rows" ? "columns" : "rows"];
    const across = (axis === "rows" ? table.columns : table.rows).length - 1;
    const whole = acrossFrom === 0 && acrossTo === across;
    return whole && index >= from && index < to ? [from, to] : null;
  };

  /**
   * spanOf returns the rows or columns the handle at `index` works on: the
   * selected ones if it is among them, just its own otherwise
   */
  const spanOf = (axis: Axis, index: number): Span =>
    selectedSpan(axis, index) ?? [index, index + 1];

  const render = () => {
    root.hidden = !table;
    if (!table) return;
    const { box, visible, rows, columns } = table;
    const height = box.bottom - box.top;
    const across = visible.right - visible.left;

    // the handles of the row and column under the mouse; the "+" hides
    // them, so it stands out
    const inserting = hover.insertRow !== null || hover.insertColumn !== null;
    const row = !drag && !inserting ? hover.row : null;
    const column = !drag && !inserting ? hover.column : null;
    place(
      rowGrip,
      row === null
        ? null
        : {
            left: box.left - 6,
            top: rows[row] + 6,
            width: 12,
            height: Math.max(rows[row + 1] - rows[row] - 12, 8),
          },
    );
    rowGrip.classList.toggle(
      "selected",
      row !== null && !!selectedSpan("rows", row),
    );
    const columnLeft =
      column === null ? 0 : Math.max(columns[column], visible.left);
    const columnRight =
      column === null ? 0 : Math.min(columns[column + 1], visible.right);
    place(
      columnGrip,
      column === null || columnRight - columnLeft <= 16
        ? null
        : {
            left: columnLeft + 6,
            top: box.top - 6,
            width: columnRight - columnLeft - 12,
            height: 12,
          },
    );
    columnGrip.classList.toggle(
      "selected",
      column !== null && !!selectedSpan("columns", column),
    );

    // the "+" and the line where it inserts
    const y = hover.insertRow === null ? null : rows[hover.insertRow];
    const x = hover.insertColumn === null ? null : columns[hover.insertColumn];
    const columnShown = x !== null && x >= visible.left && x <= visible.right;
    if (!drag && y !== null) {
      place(insert, { left: box.left - 9, top: y - 9, width: 18, height: 18 });
      place(insertLine, {
        left: visible.left,
        top: y - 1,
        width: across,
        height: 2,
      });
    } else if (!drag && columnShown) {
      place(insert, { left: x - 9, top: box.top - 9, width: 18, height: 18 });
      place(insertLine, { left: x - 1, top: box.top, width: 2, height });
    } else {
      place(insert, null);
      place(insertLine, null);
    }

    // the lines between columns, which resize them
    const lines = columns.slice(1, -1);
    while (resizers.children.length < lines.length) {
      const resizer = element(resizers, "div", "resizer");
      // the column after the line
      resizer.dataset.index = String(resizers.children.length);
    }
    while (resizers.children.length > lines.length) {
      resizers.lastElementChild!.remove();
    }
    lines.forEach((line, i) => {
      const shown = !drag && line > visible.left && line < visible.right;
      place(
        resizers.children[i] as HTMLElement,
        shown ? { left: line - 4, top: box.top, width: 8, height } : null,
      );
    });

    // the edges, which add and drop columns and rows
    const rightShown = !drag && box.right <= visible.right + 1;
    place(
      right,
      rightShown
        ? { left: box.right - 3, top: box.top, width: 9, height: height - 6 }
        : null,
    );
    place(
      bottom,
      drag
        ? null
        : {
            left: visible.left,
            top: box.bottom - 3,
            width: across - 6,
            height: 9,
          },
    );
    place(
      corner,
      rightShown
        ? { left: box.right - 5, top: box.bottom - 5, width: 12, height: 12 }
        : null,
    );
  };

  /**
   * preview shows what the drag leads to: where rows or columns land, where
   * the line between columns goes, or the table's new size
   */
  const preview = (current: Drag, now: TableHandlesState) => {
    const { box, visible, rows, columns } = now;
    const height = box.bottom - box.top;
    const outcome = outcomeOf(current, now);
    if (outcome.kind === "move" && current.kind === "move") {
      const lines = current.axis === "rows" ? rows : columns;
      const [from, to] = current.span;
      if (current.axis === "rows") {
        const across = visible.right - visible.left;
        place(guide, {
          left: visible.left,
          top: lines[outcome.line] - 2,
          width: across,
          height: 4,
        });
        place(dragged, {
          left: visible.left,
          top: lines[from],
          width: across,
          height: lines[to] - lines[from],
        });
      } else {
        const left = Math.max(lines[from], visible.left);
        place(guide, {
          left: lines[outcome.line] - 2,
          top: box.top,
          width: 4,
          height,
        });
        place(dragged, {
          left,
          top: box.top,
          width: Math.min(lines[to], visible.right) - left,
          height,
        });
      }
      render();
    } else if (outcome.kind === "resize" && current.kind === "resize") {
      const before = outcome.widths
        .slice(0, current.index)
        .reduce((sum, width) => sum + width, 0);
      const x = box.left + ((box.right - box.left) * before) / 100;
      place(guide, { left: x - 1, top: box.top, width: 2, height });
    } else if (outcome.kind === "edge") {
      const width =
        extent(columns, outcome.cols, growStep(columns, true)) - box.left;
      const tall = extent(rows, outcome.rows, growStep(rows, false)) - box.top;
      place(ghost, { left: box.left, top: box.top, width, height: tall });
      size.textContent = `${outcome.cols} × ${outcome.rows}`;
    }
  };

  /**
   * finish does what the drag led to
   */
  const finish = (current: Drag, now: TableHandlesState) => {
    const outcome = outcomeOf(current, now);
    if (current.kind === "move" && !current.moving) {
      // a click on a handle
      const grip = current.axis === "rows" ? rowGrip : columnGrip;
      const rect = grip.getBoundingClientRect();
      const anchor = { left: rect.left, top: rect.top, bottom: rect.bottom };
      if (current.axis === "rows") now.selectRows(current.span, anchor);
      else now.selectColumns(current.span, anchor);
    } else if (outcome.kind === "move" && current.kind === "move") {
      if (outcome.by === 0) return;
      if (current.axis === "rows") now.moveRows(current.span, outcome.by);
      else now.moveColumns(current.span, outcome.by);
    } else if (outcome.kind === "resize") {
      if (current.at.x !== current.start.x) now.setWidths(outcome.widths);
    } else if (outcome.kind === "edge") {
      const changed =
        outcome.cols !== now.columns.length - 1 ||
        outcome.rows !== now.rows.length - 1;
      if (changed) now.resize(outcome.cols, outcome.rows);
    }
  };

  const update = () => {
    hover = table ? hoverAt(table, pointer) : nothing;
    render();
  };

  const endDrag = () => {
    drag = null;
    place(guide, null);
    place(dragged, null);
    place(ghost, null);
    table?.hold(false);
    update();
  };

  const unsubscribe = tableHandles.subscribe(
    (state) => {
      table = state;
      update();
    },
    { immediate: true },
  );

  const move = (event: MouseEvent) => {
    pointer = { x: event.clientX, y: event.clientY };
    if (!drag) update();
  };
  // Esc cancels a drag
  const cancel = (event: KeyboardEvent) => {
    if (drag && event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      endDrag();
    }
  };
  window.addEventListener("mousemove", move);
  window.addEventListener("keydown", cancel, true);

  // pressing a handle keeps the focus in the editor
  root.addEventListener("mousedown", (event) => event.preventDefault());

  root.addEventListener("pointerdown", (event) => {
    const target = event.target as HTMLElement;
    if (!table || event.button !== 0) return;
    const start = { x: event.clientX, y: event.clientY };
    const at = start;
    if (target === insert) {
      if (hover.insertRow !== null) table.insertRow(hover.insertRow);
      else if (hover.insertColumn !== null) {
        table.insertColumn(hover.insertColumn);
      }
      return;
    }
    if (target === rowGrip && hover.row !== null) {
      const span = spanOf("rows", hover.row);
      drag = { kind: "move", axis: "rows", span, start, at, moving: false };
    } else if (target === columnGrip && hover.column !== null) {
      const span = spanOf("columns", hover.column);
      drag = { kind: "move", axis: "columns", span, start, at, moving: false };
    } else if (target.classList.contains("resizer")) {
      // a double click sizes the columns by content again; told apart here,
      // since the pointer capture sends the dblclick event to the root
      const index = Number(target.dataset.index);
      const now = Date.now();
      if (lastPress?.index === index && now - lastPress.time < DOUBLE_CLICK) {
        lastPress = null;
        table.setWidths(null);
        return;
      }
      lastPress = { index, time: now };
      drag = { kind: "resize", index, start, at };
    } else if (target.classList.contains("edge")) {
      const horizontal = target !== bottom;
      const vertical = target !== right;
      drag = { kind: "edge", horizontal, vertical, start, at };
    } else {
      return;
    }
    // keeps the drag going while the mouse leaves the handle
    root.setPointerCapture?.(event.pointerId);
    table.hold(true);
  });

  root.addEventListener("pointermove", (event) => {
    if (!drag || !table) return;
    drag.at = { x: event.clientX, y: event.clientY };
    if (drag.kind === "move" && !drag.moving) {
      const distance = Math.hypot(
        drag.at.x - drag.start.x,
        drag.at.y - drag.start.y,
      );
      if (distance < DRAG_AFTER) return;
      drag.moving = true;
    }
    preview(drag, table);
  });

  root.addEventListener("pointerup", () => {
    if (!drag || !table) return;
    const current = drag;
    const now = table;
    endDrag();
    finish(current, now);
  });

  root.addEventListener("pointercancel", endDrag);

  return () => {
    unsubscribe();
    window.removeEventListener("mousemove", move);
    window.removeEventListener("keydown", cancel, true);
    root.remove();
  };
};
