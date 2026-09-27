import { schema as base } from "prosemirror-markdown";
import { NodeSpec, Schema } from "prosemirror-model";
import { tableNodes } from "prosemirror-tables";

export type Alignment = "left" | "center" | "right";

const ALIGNMENTS: readonly string[] = ["left", "center", "right"];

/**
 * alignment returns `value` if it names a column alignment, null otherwise
 */
export const alignment = (value: unknown): Alignment | null => {
  const lower = typeof value === "string" ? value.trim().toLowerCase() : "";
  return ALIGNMENTS.includes(lower) ? (lower as Alignment) : null;
};

/**
 * captionText returns the text of the caption of the table `dom`, the
 * `data-caption` attribute set by the HTML normalizer or a `<caption>` child
 */
const captionText = (dom: HTMLElement): string | null => {
  const text =
    dom.getAttribute("data-caption") ??
    dom.querySelector(":scope > caption")?.textContent ??
    "";
  return text.replace(/\s+/g, " ").trim() || null;
};

const cells = tableNodes({
  tableGroup: "block",
  // no headings, rules or tables: a cell holds what a table cell in Word does
  cellContent:
    "(paragraph | bullet_list | ordered_list | blockquote | code_block)+",
  cellAttributes: {
    align: {
      default: null,
      getFromDOM: (dom) =>
        alignment(dom.style.textAlign || dom.getAttribute("align")),
      setDOMAttr: (value, attrs) => {
        if (value) attrs.style = `text-align: ${value}`;
      },
    },
  },
});

const table: NodeSpec = {
  ...cells.table,
  // a plain-text attribute: TableMap expects the table to hold only rows
  attrs: { caption: { default: null } },
  parseDOM: [
    { tag: "table", getAttrs: (dom) => ({ caption: captionText(dom) }) },
    // the caption is read into the attribute and never becomes a row
    { tag: "caption", ignore: true },
  ],
  toDOM: (node) =>
    node.attrs.caption
      ? ["table", ["caption", node.attrs.caption], ["tbody", 0]]
      : ["table", ["tbody", 0]],
};

// Blank's markdown schema: the prosemirror-markdown schema with the table
// nodes of prosemirror-tables, whose doc also keeps the file's frontmatter
// (the YAML block at its top) as it was written, or null if the file has
// none. Node types of two schemas can't be mixed, so the whole app uses this
// one (see ./index.ts).
export const schema = new Schema({
  nodes: base.spec.nodes
    .update("doc", {
      ...base.spec.nodes.get("doc"),
      attrs: { frontmatter: { default: null } },
    })
    .append({
      table,
      table_row: cells.table_row,
      table_cell: cells.table_cell,
      table_header: cells.table_header,
    }),
  marks: base.spec.marks,
});
