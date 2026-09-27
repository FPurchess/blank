import type { Node } from "prosemirror-model";
import { Plugin } from "prosemirror-state";
import { TableMap } from "prosemirror-tables";
import type {
  EditorView,
  NodeView,
  ViewMutationRecord,
} from "prosemirror-view";

import { tableAround } from "./util";

// the NodeView of each rendered table, found through its DOM
const views = new WeakMap<HTMLElement, TableView>();

/**
 * columnWidths measures the width of each column of the rendered `table`,
 * from cells that span a single column. A column only covered by merged cells
 * gets its share of them.
 */
export const columnWidths = (node: Node, rows: HTMLElement[]): number[] => {
  const map = TableMap.get(node);
  const elements = new Map<number, HTMLElement>();
  let rowPos = 0;
  node.forEach((row, _, r) => {
    let cellPos = rowPos + 1;
    row.forEach((cell, _, c) => {
      const element = rows[r]?.children[c] as HTMLElement | undefined;
      if (element) elements.set(cellPos, element);
      cellPos += cell.nodeSize;
    });
    rowPos += row.nodeSize;
  });

  const widths: (number | null)[] = Array(map.width).fill(null);
  const spanning: { from: number; to: number; width: number }[] = [];
  for (let r = 0; r < map.height; r++) {
    for (let c = 0; c < map.width; c++) {
      const offset = map.map[r * map.width + c];
      const element = elements.get(offset);
      if (!element) continue;
      const width = element.getBoundingClientRect().width;
      const { colspan } = node.nodeAt(offset)!.attrs;
      if (colspan === 1) widths[c] ??= width;
      else spanning.push({ from: c, to: c + colspan, width });
    }
  }
  for (const { from, to, width } of spanning) {
    const unknown = widths.slice(from, to).filter((w) => w === null).length;
    if (!unknown) continue;
    const known = widths
      .slice(from, to)
      .reduce<number>((sum, w) => sum + (w ?? 0), 0);
    const share = Math.max(width - known, 0) / unknown;
    for (let c = from; c < to; c++) widths[c] ??= share;
  }
  const measured = widths.filter((w): w is number => w !== null);
  const fallback = measured.length
    ? measured.reduce((a, b) => a + b, 0) / measured.length
    : 100;
  return widths.map((w) => w ?? fallback);
};

/**
 * TableView renders a table in a box that scrolls sideways when the table is
 * wider than the page, with its caption, and can freeze its column widths
 */
export class TableView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  private table: HTMLTableElement;
  private caption: HTMLElement;
  private colgroup: HTMLElement;
  private frozenColumns = 0;

  constructor(private node: Node) {
    this.dom = document.createElement("div");
    this.dom.className = "table-block";
    const scroll = document.createElement("div");
    scroll.className = "table-scroll";
    this.table = document.createElement("table");
    this.caption = document.createElement("caption");
    this.caption.contentEditable = "false";
    this.colgroup = document.createElement("colgroup");
    this.contentDOM = document.createElement("tbody");
    this.table.append(this.caption, this.colgroup, this.contentDOM);
    scroll.append(this.table);
    this.dom.append(scroll);
    this.render();
    views.set(this.dom, this);
  }

  private render() {
    const caption = this.node.attrs.caption as string | null;
    this.caption.textContent = caption ?? "";
    this.caption.hidden = !caption;
  }

  get frozen() {
    return this.frozenColumns > 0;
  }

  /**
   * freeze fixes the column widths as they are, so they don't change while
   * the cursor is in the table
   */
  freeze() {
    const rows = [...this.contentDOM.children] as HTMLElement[];
    const widths = columnWidths(this.node, rows);
    if (!widths.some((width) => width > 0)) return;
    this.colgroup.replaceChildren(
      ...widths.map((width) => {
        const col = document.createElement("col");
        col.style.width = `${width}px`;
        return col;
      }),
    );
    this.table.style.width = `${widths.reduce((a, b) => a + b, 0)}px`;
    this.table.style.tableLayout = "fixed";
    this.frozenColumns = widths.length;
  }

  /**
   * unfreeze lets the columns size to their content again
   */
  unfreeze() {
    this.colgroup.replaceChildren();
    this.table.style.width = "";
    this.table.style.tableLayout = "";
    this.frozenColumns = 0;
  }

  /**
   * refreeze measures the columns again, e.g. after columns were added
   */
  refreeze() {
    this.unfreeze();
    this.freeze();
  }

  update(node: Node) {
    if (node.type !== this.node.type) return false;
    const columnsChanged =
      this.frozen && TableMap.get(node).width !== this.frozenColumns;
    this.node = node;
    this.render();
    if (columnsChanged) {
      // measure once the new cells are rendered
      window.setTimeout(() => this.refreeze());
    }
    return true;
  }

  ignoreMutation(mutation: ViewMutationRecord) {
    if (mutation.type === "selection") return false;
    // the caption and column widths are the view's own
    return !this.contentDOM.contains(mutation.target);
  }
}

/**
 * tableViewAt returns the view of the table the selection is in
 */
const tableViewAt = (view: EditorView): TableView | undefined => {
  const table = tableAround(view.state.selection.$head);
  if (!table) return undefined;
  const dom = view.nodeDOM(table.pos);
  return dom instanceof HTMLElement ? views.get(dom) : undefined;
};

/**
 * tableView renders tables and keeps the column widths of the table the
 * cursor is in from changing while typing. They relax once it leaves.
 */
export const tableView = () =>
  new Plugin({
    props: {
      nodeViews: { table: (node) => new TableView(node) },
    },
    view(view) {
      let frozen: TableView | undefined;
      const sync = () => {
        const current = tableViewAt(view);
        if (current === frozen) return;
        frozen?.unfreeze();
        current?.freeze();
        frozen = current;
      };
      let timer: number | undefined;
      const resize = () => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => frozen?.refreeze(), 150);
      };
      window.addEventListener("resize", resize);
      sync();
      return {
        update: sync,
        destroy: () => {
          window.removeEventListener("resize", resize);
          window.clearTimeout(timer);
        },
      };
    },
  });
