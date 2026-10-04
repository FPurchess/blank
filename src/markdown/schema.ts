import { schema as base } from "prosemirror-markdown";
import { type Node, NodeSpec, Schema } from "prosemirror-model";
import { tableNodes } from "prosemirror-tables";

import { ATOMS, extraArgs, isDepth, TOC_DEFAULTS } from "./blocks/atoms";
import {
  checkEmbed,
  EMBED_ARGS,
  type EmbedAttrs,
  embedLabel,
  embedSrc,
} from "./blocks/embeds";

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

// a content block Blank can't show: one of a newer Blank, or markers that
// don't pair up (see ./blocks/rules.ts). It keeps the lines it was read from,
// and is written back exactly so.
const unknownBlock: NodeSpec = {
  group: "top_block",
  atom: true,
  selectable: true,
  attrs: { raw: { default: "" } },
  // before the code block's `pre`
  parseDOM: [
    {
      tag: "pre[data-blank-unknown]",
      priority: 60,
      getAttrs: (dom) => ({ raw: dom.textContent ?? "" }),
    },
  ],
  toDOM: (node) => [
    "pre",
    { class: "unknown-block", "data-blank-unknown": "" },
    node.attrs.raw as string,
  ],
};

// a table of contents of the document's headings up to `depth`, which the
// layout engine lays out with their pages; without the engine, a list of
// the headings (src/editor/plugins/toc.ts). `extra` keeps arguments of its
// marker that a newer Blank wrote.
const toc: NodeSpec = {
  group: "top_block",
  atom: true,
  selectable: true,
  attrs: {
    depth: { default: TOC_DEFAULTS.depth },
    title: { default: TOC_DEFAULTS.title },
    extra: { default: {} },
  },
  parseDOM: [
    {
      tag: "nav[data-blank-toc]",
      getAttrs: (dom) => {
        const depth = Number(dom.getAttribute("data-depth"));
        let extra: unknown = {};
        try {
          extra = JSON.parse(dom.getAttribute("data-extra") ?? "{}");
        } catch {
          // the arguments of a newer Blank, lost on the way
        }
        return {
          depth: isDepth(depth) ? depth : TOC_DEFAULTS.depth,
          title: dom.getAttribute("data-title") ?? TOC_DEFAULTS.title,
          extra: extraArgs(extra, ATOMS.toc.order),
        };
      },
    },
  ],
  toDOM: (node) => [
    "nav",
    {
      class: "toc",
      "data-blank-toc": "",
      "data-depth": String(node.attrs.depth),
      "data-title": node.attrs.title as string,
      "data-extra": JSON.stringify(node.attrs.extra),
    },
  ],
};

// content of another app, e.g. a drawing (src/markdown/blocks/embeds.ts):
// its type, its data as the app wrote it, and its drawing, which Blank
// shows. In the editor's DOM, and so on the clipboard, it is a figure that
// holds all of it as JSON, which a paste checks as a file is.
const embed: NodeSpec = {
  group: "top_block",
  atom: true,
  selectable: true,
  attrs: {
    type: { default: "" },
    id: { default: "" },
    width: { default: "" },
    alt: { default: "" },
    data: { default: "" },
    lang: { default: "json" },
    svg: { default: "" },
    extra: { default: {} },
  },
  parseDOM: [
    {
      tag: "figure[data-blank-embed]",
      getAttrs: (dom) => {
        try {
          const read = JSON.parse(dom.getAttribute("data-blank-embed") ?? "");
          const { data, lang, svg, extra, ...args } = read as EmbedAttrs;
          return (
            checkEmbed(
              { ...extraArgs(extra, EMBED_ARGS), ...args },
              data ? { text: data, lang } : null,
              svg,
            ) ?? false
          );
        } catch {
          return false;
        }
      },
    },
  ],
  toDOM: (node) => [
    "figure",
    { class: "embed", "data-blank-embed": JSON.stringify(node.attrs) },
    ["img", { src: embedSrc(node), alt: embedLabel(node) }],
  ],
};

// a form placed from a form definition (src/markdown/blocks/definitions.ts): its
// fields, in the order its definition gives them. `def` is the key of its
// definition in the doc's `definitions`; `extra` keeps arguments of its
// marker that a newer Blank wrote. The editor's form guard keeps it as its
// definition says (src/editor/plugins/forms/index.ts).
const formBlock: NodeSpec = {
  group: "top_block",
  content: "form_field+",
  isolating: true,
  selectable: true,
  attrs: { def: { default: "" }, extra: { default: {} } },
  parseDOM: [
    {
      tag: "section[data-blank-form]",
      getAttrs: (dom) => ({ def: dom.getAttribute("data-blank-form") ?? "" }),
    },
  ],
  toDOM: (node) => [
    "section",
    { class: "form", "data-blank-form": node.attrs.def as string },
    0,
  ],
};

// a field of a form, which holds what a block of the document does, but no
// page break nor another content block
const formField: NodeSpec = {
  content: "field_content+",
  isolating: true,
  attrs: { name: { default: "" } },
  parseDOM: [
    {
      tag: "div[data-blank-field]",
      getAttrs: (dom) => ({ name: dom.getAttribute("data-blank-field") ?? "" }),
    },
  ],
  toDOM: (node) => [
    "div",
    { class: "field", "data-blank-field": node.attrs.name as string },
    0,
  ],
};

// the blocks a field holds: those of the document but page breaks and
// content blocks (the tokens they're read from are FIELD_CONTENT in
// ./blocks/rules.ts)
const FIELD_CONTENT = [
  "paragraph",
  "blockquote",
  "horizontal_rule",
  "heading",
  "code_block",
  "ordered_list",
  "bullet_list",
  "table",
];

const nodes = base.spec.nodes
  .update("doc", {
    ...base.spec.nodes.get("doc"),
    content: "(block | top_block)+",
    attrs: {
      frontmatter: { default: null },
      // the definitions of its forms Blank can read, by their key, and
      // the YAML of the others as written
      definitions: { default: {} },
      rawDefinitions: { default: [] },
    },
  })
  .addBefore("image", "page_break", pageBreak)
  .addBefore("image", "toc", toc)
  .addBefore("image", "form_block", formBlock)
  .addBefore("image", "form_field", formField)
  .addBefore("image", "embed", embed)
  .addBefore("image", "unknown_block", unknownBlock)
  .append({
    table,
    table_row: cells.table_row,
    table_cell: cells.table_cell,
    table_header: cells.table_header,
  });

// Blank's markdown schema: the prosemirror-markdown schema with the table
// nodes of prosemirror-tables, whose doc also keeps the file's frontmatter
// (the YAML block at its top) as it was written, or null if the file has
// none, and the definitions of its forms (see ./blocks/definitions.ts).
// Content blocks (the group `top_block`) stand only at the top of the
// document. Node types of two schemas can't be mixed, so the whole app uses
// this one (see ./index.ts).
export const schema = new Schema({
  nodes: FIELD_CONTENT.reduce(
    (all, name) =>
      all.update(name, { ...all.get(name), group: "block field_content" }),
    nodes,
  ),
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
  "toc",
  "form_block",
  "form_field",
  "embed",
  "unknown_block",
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
