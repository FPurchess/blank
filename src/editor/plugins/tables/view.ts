import type { Node } from "prosemirror-model";
import { Plugin } from "prosemirror-state";
import type { NodeView, ViewMutationRecord } from "prosemirror-view";

import { columnPercents } from "../../../markdown/tables";

/**
 * TableView renders a table in a box that scrolls sideways when the table is
 * wider than the page, with its caption and the column widths set on it. A
 * table without them sizes its columns to their content. The page view lays
 * tables out with the engine, which keeps the columns of the table the
 * cursor is in while typing (see frozenWidths in ../pageView.ts).
 */
export class TableView implements NodeView {
  dom: HTMLElement;
  contentDOM: HTMLElement;
  // the rendered table
  readonly element: HTMLTableElement;
  private caption: HTMLElement;
  private colgroup: HTMLElement;

  constructor(private node: Node) {
    this.dom = document.createElement("div");
    this.dom.className = "table-block";
    const scroll = document.createElement("div");
    scroll.className = "table-scroll";
    this.element = document.createElement("table");
    this.caption = document.createElement("caption");
    this.caption.contentEditable = "false";
    this.colgroup = document.createElement("colgroup");
    this.contentDOM = document.createElement("tbody");
    this.element.append(this.caption, this.colgroup, this.contentDOM);
    scroll.append(this.element);
    this.dom.append(scroll);
    this.render();
  }

  private render() {
    const caption = this.node.attrs.caption as string | null;
    this.caption.textContent = caption ?? "";
    this.caption.hidden = !caption;
    const percents = columnPercents(this.node);
    this.colgroup.replaceChildren(
      ...(percents ?? []).map((percent) => {
        const col = document.createElement("col");
        col.style.width = `${percent}%`;
        return col;
      }),
    );
    this.element.style.width = percents ? "100%" : "";
    this.element.style.tableLayout = percents ? "fixed" : "";
  }

  update(node: Node) {
    if (node.type !== this.node.type) return false;
    this.node = node;
    this.render();
    return true;
  }

  ignoreMutation(mutation: ViewMutationRecord) {
    if (mutation.type === "selection") return false;
    // the caption and column widths are the view's own
    return !this.contentDOM.contains(mutation.target);
  }
}

/**
 * tableView renders tables, see TableView
 */
export const tableView = () =>
  new Plugin({
    props: {
      nodeViews: {
        table: (node) => new TableView(node),
      },
    },
  });
