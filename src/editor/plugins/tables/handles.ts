import { Plugin, type Command } from "prosemirror-state";
import { isInTable, selectedRect } from "prosemirror-tables";
import type { EditorView } from "prosemirror-view";

import { columnPercents, roundPercent } from "../../../markdown/tables";
import { headerRowCount } from "../../../markdown";
import {
  type Point,
  tableHandles as handles,
  type TableHandlesState,
} from "../../../state";
import {
  insertColumnAt,
  insertRowAt,
  moveColumnsBy,
  moveRowsBy,
  resizeTable,
  selectColumns,
  selectRows,
  smallestSize,
} from "../../commands/table/grid";
import {
  hasHeaderColumn,
  selectIn,
  sequence,
  tableRect,
} from "../../commands/table/rect";
import { setColumnWidths } from "../../commands/table/widths";
import { openTableMenu } from "../contextMenu";
import { reporting } from "./tools";
import { columnWidths, tableViewOf, type TableView } from "./view";

// how far around a table the mouse still shows its handles, which sit on and
// just outside its edges, in px
const MARGIN = { left: 28, top: 20, right: 24, bottom: 24 };

/**
 * tableUnder returns the view of the table at `point` or just around it
 */
const tableUnder = (view: EditorView, point: Point): TableView | undefined => {
  for (const block of view.dom.querySelectorAll(".table-block")) {
    const table = tableViewOf(block);
    if (!table) continue;
    const box = table.element.getBoundingClientRect();
    if (
      point.x >= box.left - MARGIN.left &&
      point.x <= box.right + MARGIN.right &&
      point.y >= box.top - MARGIN.top &&
      point.y <= box.bottom + MARGIN.bottom
    ) {
      return table;
    }
  }
  return undefined;
};

/**
 * selectedSpans returns the rows and columns selected in the table at
 * `tableStart`, if the selection is in it
 */
const selectedSpans = (view: EditorView, tableStart: number) => {
  const { state } = view;
  if (!isInTable(state)) return null;
  const rect = selectedRect(state);
  if (rect.tableStart !== tableStart) return null;
  return {
    rows: [rect.top, rect.bottom] as [number, number],
    columns: [rect.left, rect.right] as [number, number],
  };
};

/**
 * tableHandles lets the mouse change the table it is over: the handles of
 * its rows and columns select them, open the table menu and move them, the
 * "+" between them inserts one, the lines between columns resize them and
 * the table's edges add and drop rows and columns. The handles show while
 * the mouse moves and hide while typing; src/tableHandles.ts renders them.
 */
export const tableHandles = () => {
  let pointer: Point | null = null;
  let hidden = false;
  let held: TableView | undefined;
  // the table whose handles show
  let shown: TableView | undefined;

  const clear = () => {
    shown = undefined;
    if (handles.value) handles.value = null;
  };

  /**
   * publish shows the handles of the table under the mouse, measured as it
   * is rendered now
   */
  const publish = (view: EditorView) => {
    const table = held ?? (pointer && !hidden && tableUnder(view, pointer));
    const located = table ? table.located : null;
    if (!table || !located) {
      clear();
      return;
    }
    shown = table;
    const { node, start } = located;
    const { element } = table;
    // the rows, without the caption above them
    const body = element.tBodies[0];
    const box = body.getBoundingClientRect();
    const scroll = element.parentElement!.getBoundingClientRect();
    const rowElements = [...body.rows];
    const rows = rowElements.map((row) => row.getBoundingClientRect().top);
    rows.push(box.bottom);
    const widths = columnWidths(node, rowElements);
    const columns = [box.left];
    for (const width of widths)
      columns.push(columns[columns.length - 1] + width);
    const total = widths.reduce((sum, width) => sum + width, 0) || 1;

    const run = (command: Command, message: string) => {
      reporting(() =>
        command(view.state, view.dispatch, view) ? message : "",
      );
      view.focus();
    };
    handles.value = {
      box: {
        left: box.left,
        top: box.top,
        right: box.right,
        bottom: box.bottom,
      },
      visible: {
        left: Math.max(box.left, scroll.left),
        right: Math.min(box.right, scroll.right),
      },
      rows,
      columns,
      headerRows: headerRowCount(node),
      headerColumn: hasHeaderColumn(tableRect(view.state, start)),
      smallest: smallestSize(node),
      percents:
        columnPercents(node) ??
        widths.map((width) => roundPercent((width / total) * 100)),
      selected: selectedSpans(view, start),
      insertRow: (index) => run(insertRowAt(start, index), "A row added"),
      insertColumn: (index) =>
        run(insertColumnAt(start, index), "A column added"),
      selectRows: ([from, to], anchor) => {
        selectRows(start, from, to)(view.state, view.dispatch);
        openTableMenu(view, anchor);
      },
      selectColumns: ([from, to], anchor) => {
        selectColumns(start, from, to)(view.state, view.dispatch);
        openTableMenu(view, anchor);
      },
      moveRows: ([from, to], by) =>
        run(
          moveRowsBy(start, from, to, by),
          by < 0 ? "Moved up" : "Moved down",
        ),
      moveColumns: ([from, to], by) =>
        run(
          moveColumnsBy(start, from, to, by),
          by < 0 ? "Moved left" : "Moved right",
        ),
      resize: (cols, rows) =>
        run(
          resizeTable(start, cols, rows),
          `Table resized to ${cols} × ${rows}`,
        ),
      setWidths: (percents) => {
        const set = setColumnWidths(start, percents);
        // the cursor goes into the table, whose change of format is told
        run(
          selectedSpans(view, start)
            ? set
            : sequence([
                selectIn(start, { top: 0, bottom: 1, left: 0, right: 1 }),
                set,
              ]),
          percents ? "Column widths set" : "Column widths reset",
        );
      },
      hold: (hold) => {
        held = hold ? table : undefined;
        if (!hold) publish(view);
      },
    } satisfies TableHandlesState;
  };

  return new Plugin({
    props: {
      handleDOMEvents: {
        // typing hides the handles, until the mouse moves again; the DOM
        // event, since plugins before this one handle keys like Tab
        keydown: () => {
          if (!held) {
            hidden = true;
            clear();
          }
          return false;
        },
      },
    },
    view(view) {
      const move = (event: MouseEvent) => {
        pointer = { x: event.clientX, y: event.clientY };
        const wasHidden = hidden;
        hidden = false;
        // the handles work out the row and column under the mouse, so the
        // table is measured again only when the mouse gets to another one
        if (held || (!wasHidden && tableUnder(view, pointer) === shown)) return;
        publish(view);
      };
      const leave = () => {
        pointer = null;
        if (!held) clear();
      };
      const reposition = () => publish(view);
      window.addEventListener("mousemove", move);
      document.documentElement.addEventListener("mouseleave", leave);
      window.addEventListener("scroll", reposition, true);
      window.addEventListener("resize", reposition);
      return {
        update: (view, previous) => {
          // a change to the table or what's selected in it
          const { doc, selection } = view.state;
          if (doc !== previous.doc || !selection.eq(previous.selection)) {
            publish(view);
          }
        },
        destroy: () => {
          window.removeEventListener("mousemove", move);
          document.documentElement.removeEventListener("mouseleave", leave);
          window.removeEventListener("scroll", reposition, true);
          window.removeEventListener("resize", reposition);
          clear();
        },
      };
    },
  });
};
