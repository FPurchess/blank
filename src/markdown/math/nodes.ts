import { Fragment, type NodeSpec, type Schema } from "prosemirror-model";

import { textAlignment } from "../alignment";
import { sourceBlockSpecs } from "../blocks/sourceBlock";

/*
 * The math nodes: display math (`$$…$$`), a block holding its LaTeX in a
 * `math_display_source` code child, and inline math (`$…$`), an inline node
 * holding its LaTeX as text. Both are shown set while the selection is
 * outside them, and as their source while it is in them (see src/math/).
 * `delim` is how the file wrote them, kept for writing them back.
 */

/**
 * texOf returns the LaTeX a pasted `<math>` element (KaTeX's, Temml's,
 * Wikipedia's) carries, or null
 */
export const texOf = (dom: HTMLElement) =>
  dom
    .querySelector('annotation[encoding="application/x-tex"]')
    ?.textContent?.trim() ||
  dom.getAttribute("alttext")?.trim() ||
  null;

const text = (schema: Schema, source: string | null) =>
  source ? Fragment.from(schema.text(source)) : Fragment.empty;

const DISPLAY_DELIMS = ["dollar", "fence"];

/**
 * checkMath returns the attributes of display math as a paste gives them,
 * checked
 */
const checkMath = (read: Record<string, unknown>) => ({
  label:
    typeof read.label === "string" && /^[\w:.-]+$/.test(read.label)
      ? read.label
      : null,
  delim: DISPLAY_DELIMS.includes(read.delim as string) ? read.delim : "dollar",
  align: textAlignment(read.align as string | null),
});

const displaySpecs = sourceBlockSpecs("math_display", {
  attrs: {
    // the id of a numbered equation, eq-…: {#eq-…} in markdown
    label: { default: null },
    delim: { default: "dollar" },
    align: { default: null },
  },
  caps: { align: true, alignDefault: "center" },
  // in lists, quotes and table cells too
  group: "block",
  check: checkMath,
});

export const mathDisplay: NodeSpec = {
  ...displaySpecs.math_display,
  parseDOM: [
    ...(displaySpecs.math_display.parseDOM ?? []),
    // display math pasted from a web page: its LaTeX
    {
      tag: "math[display=block]",
      getAttrs: (dom) => (texOf(dom) ? {} : false),
      getContent: (dom, schema) =>
        Fragment.from(
          schema.nodes.math_display_source.create(
            null,
            text(schema, texOf(dom as HTMLElement)),
          ),
        ),
    },
  ],
};

export const mathDisplaySource = displaySpecs.math_display_source;

const INLINE_DELIMS = ["dollar", "backtick", "paren", "display"];

export const mathInline: NodeSpec = {
  inline: true,
  group: "inline",
  content: "text*",
  marks: "",
  code: true,
  attrs: { delim: { default: "dollar" } },
  parseDOM: [
    {
      tag: "span[data-math]",
      preserveWhitespace: "full",
      getAttrs: (dom) => {
        const delim = dom.getAttribute("data-math");
        return {
          delim: INLINE_DELIMS.includes(delim ?? "") ? delim : "dollar",
        };
      },
    },
    // inline math pasted from a web page: its LaTeX, not its letters
    {
      tag: "math",
      getAttrs: (dom) => (texOf(dom) ? {} : false),
      getContent: (dom, schema) => text(schema, texOf(dom as HTMLElement)),
    },
    // the letters KaTeX draws its HTML with, beside the MathML read above
    { tag: "span.katex-html", ignore: true },
    // Wikipedia's picture of a formula, whose alt text is its LaTeX
    {
      tag: "img.mwe-math-fallback-image-inline",
      // before the image's img[src]
      priority: 60,
      getContent: (dom, schema) =>
        text(schema, (dom as HTMLElement).getAttribute("alt")?.trim() || null),
    },
  ],
  toDOM: (node) => ["span", { "data-math": node.attrs.delim }, 0],
};
