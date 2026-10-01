import type { Node } from "prosemirror-model";
import { Plugin, type Command } from "prosemirror-state";
import { isInTable, selectedRect } from "prosemirror-tables";
import type { EditorView } from "prosemirror-view";

import { columnPercents, roundPercent } from "../../../markdown/tables";
import { headerRowCount } from "../../../markdown";
import { watch } from "vue";

import {
  pageAt,
  tableGeometry,
  type TableGeometry,
  tablePositions,
  type TablePiece,
} from "../../../engine/geometry";
import { engineless, pageEngine } from "../../../engine/engine";
import {
  pageLayoutState,
  pageView,
  pageViewport,
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

// how far around a table the mouse still shows its handles, which sit on and
// just outside its edges, in px
const MARGIN = { left: 28, top: 20, right: 24, bottom: 24 };

// the part of a table under the mouse: the table, and its piece on a page
interface Under {
  node: Node;
  pos: number;
  piece: TablePiece;
  rowCount: number;
}

/**
 * Measured keeps the tables of a document as the page view shows them, for
 * the mouse, which moves far more often than the layout changes: each is
 * measured once, and only those near the page under the mouse
 */
class Measured {
  private tables: { node: Node; pos: number }[] | null = null;
  private geometries = new Map<number, TableGeometry | null>();
  private key: readonly unknown[] = [];

  // what the tables' places in the window depend on
  private keyOf(view: EditorView) {
    return [
      view.state.doc,
      pageLayoutState.value,
      pageViewport.value,
      pageView.value,
    ];
  }

  private fresh(view: EditorView) {
    const key = this.keyOf(view);
    // without the engine, the editor shows the text and scrolls itself
    if (engineless() || key.some((part, index) => part !== this.key[index])) {
      this.key = key;
      this.tables = null;
      this.geometries.clear();
    }
  }

  /**
   * geometry returns the table at `pos` as the page view shows it
   */
  geometry(view: EditorView, pos: number) {
    this.fresh(view);
    let geometry = this.geometries.get(pos);
    if (geometry === undefined) {
      geometry = tableGeometry(pos);
      this.geometries.set(pos, geometry);
    }
    return geometry;
  }

  /**
   * near returns the tables on the page under `point` and the pages next to
   * it, or all of them without pages
   */
  near(view: EditorView, point: Point) {
    this.fresh(view);
    this.tables ??= tablePositions(view.state.doc);
    const page = pageAt(point.x, point.y);
    if (!page) return this.tables;
    const before = pageEngine?.pageSpan(page.page - 1);
    const after = pageEngine?.pageSpan(page.page + 1);
    const from = before?.from ?? page.from;
    const to = after?.to ?? page.to;
    return this.tables.filter(
      ({ node, pos }) => pos <= to && pos + node.nodeSize >= from,
    );
  }
}

/**
 * tableUnder returns the piece of a table at `point` or just around it, as
 * the page view shows it
 */
const tableUnder = (
  view: EditorView,
  measured: Measured,
  point: Point,
): Under | undefined => {
  for (const { node, pos } of measured.near(view, point)) {
    const geometry = measured.geometry(view, pos);
    for (const piece of geometry?.pieces ?? []) {
      const { box } = piece;
      if (
        point.x >= box.left - MARGIN.left &&
        point.x <= box.right + MARGIN.right &&
        point.y >= box.top - MARGIN.top &&
        point.y <= box.bottom + MARGIN.bottom
      ) {
        return { node, pos, piece, rowCount: geometry!.rowCount };
      }
    }
  }
  return undefined;
};

// the same piece of the same table
const same = (a: Under | undefined, b: Under | undefined) =>
  a?.pos === b?.pos && a?.piece.page === b?.piece.page;

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
  // the table a drag holds, by its position and page
  let held: { pos: number; page: number } | undefined;
  // the table whose handles show
  let shown: Under | undefined;
  // the tables as the page view shows them
  const measured = new Measured();

  const clear = () => {
    shown = undefined;
    if (handles.value) handles.value = null;
  };

  /**
   * heldTable returns the table a drag holds, as it is laid out now
   */
  const heldTable = (view: EditorView): Under | undefined => {
    if (!held) return undefined;
    const { pos, page } = held;
    const node = view.state.doc.nodeAt(pos);
    const geometry =
      node?.type.name === "table" && measured.geometry(view, pos);
    const piece =
      geometry &&
      (geometry.pieces.find((piece) => piece.page === page) ??
        geometry.pieces[0]);
    return node && geometry && piece
      ? { node, pos, piece, rowCount: geometry.rowCount }
      : undefined;
  };

  /**
   * publish shows the handles of the table under the mouse, as the page view
   * shows it now
   */
  const publish = (view: EditorView) => {
    const table =
      heldTable(view) ??
      (!held && pointer && !hidden
        ? tableUnder(view, measured, pointer)
        : undefined);
    if (!table) {
      clear();
      return;
    }
    shown = table;
    const { node, pos, piece, rowCount } = table;
    const start = pos + 1;
    const { box, rows, columns } = piece;
    const widths = columns.slice(1).map((x, index) => x - columns[index]);
    const total = widths.reduce((sum, width) => sum + width, 0) || 1;

    const run = (command: Command, message: string) => {
      reporting(() =>
        command(view.state, view.dispatch, view) ? message : "",
      );
      view.focus();
    };
    handles.value = {
      box: { ...box },
      // the pages never scroll sideways
      visible: { left: box.left, right: box.right },
      rows,
      columns,
      firstRow: piece.firstRow,
      rowCount,
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
        held = hold ? { pos, page: piece.page } : undefined;
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
        if (
          held ||
          (!wasHidden && same(tableUnder(view, measured, pointer), shown))
        )
          return;
        publish(view);
      };
      const leave = () => {
        pointer = null;
        if (!held) clear();
      };
      window.addEventListener("mousemove", move);
      document.documentElement.addEventListener("mouseleave", leave);
      // the page view scrolled, resized or switched, or the pages were laid
      // out again, e.g. once an image above loaded
      const stop = watch([pageViewport, pageLayoutState], () => publish(view), {
        flush: "sync",
      });
      // without the engine, the editor itself scrolls
      const scrolled = () => {
        if (engineless()) publish(view);
      };
      window.addEventListener("scroll", scrolled, true);
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
          stop();
          window.removeEventListener("scroll", scrolled, true);
          clear();
        },
      };
    },
  });
};
