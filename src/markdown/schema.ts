import { schema as base } from "prosemirror-markdown";
import { type Node, NodeSpec, Schema } from "prosemirror-model";
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

// a page break, written `<!-- pagebreak -->`, which other markdown apps don't
// show. It is an <hr> in HTML, so copying it within Blank keeps it.
const pageBreak: NodeSpec = {
  group: "block",
  atom: true,
  selectable: true,
  // before the horizontal rule's `hr`
  parseDOM: [{ tag: "hr[data-page-break]", priority: 60 }],
  toDOM: () => ["hr", { class: "page-break", "data-page-break": "" }],
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
    .addBefore("image", "page_break", pageBreak)
    .append({
      table,
      table_row: cells.table_row,
      table_cell: cells.table_cell,
      table_header: cells.table_header,
    }),
  marks: base.spec.marks,
});

// the names of the schema's nodes and marks, which code that handles every
// kind of node lists in full (e.g. the Word export's `block`), so a new one
// fails the type check there until it is handled; schema.test.ts checks
// them against the schema
export const NODE_NAMES = [
  "doc",
  "paragraph",
  "blockquote",
  "horizontal_rule",
  "heading",
  "code_block",
  "ordered_list",
  "bullet_list",
  "list_item",
  "text",
  "page_break",
  "image",
  "hard_break",
  "table",
  "table_row",
  "table_cell",
  "table_header",
] as const;
export type NodeName = (typeof NODE_NAMES)[number];
export const MARK_NAMES = ["em", "strong", "link", "code"] as const;
export type MarkName = (typeof MARK_NAMES)[number];

/**
 * isHeaderCell tells whether `node` is a header cell
 */
export const isHeaderCell = (node: Node | null | undefined) =>
  node?.type === schema.nodes.table_header;

/**
 * headerRowCount returns how many leading rows of `table` hold only header
 * cells: its header rows
 */
export const headerRowCount = (table: Node) => {
  let count = 0;
  while (
    count < table.childCount &&
    table.child(count).children.every(isHeaderCell)
  ) {
    count++;
  }
  return count;
};
