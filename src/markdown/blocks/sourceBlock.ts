import type {
  Attrs,
  AttributeSpec,
  Node,
  NodeSpec,
  Schema,
} from "prosemirror-model";

import type { BlockCaps } from "./caps";

// Source blocks: a block that holds its source, e.g. a Mermaid diagram,
// and shows what it makes of it (see src/sources/registry.ts). Its node
// wraps one child `<name>_source`, a code textblock that holds the source:
//
//   diagram(diagram_source("flowchart LR\n  A --> B"))
//
// The wrapper isn't a textblock, so a paragraph can't be joined into it
// (Backspace after it selects it, as after a form), and its source isn't
// spell checked or corrected, as code isn't (`spec.code`).

export interface SourceBlockOptions {
  // its own attributes, besides those every source block has
  attrs: Record<string, AttributeSpec>;
  caps?: BlockCaps;
  // where it may stand: at the top of the document (content blocks), or
  // wherever a block may (e.g. display maths in a list)
  group?: string;
  // the attributes of a pasted one, checked as a file's are; null for one
  // that can't be
  check?: (read: Record<string, unknown>) => Attrs | null;
}

/**
 * sourceBlockSpecs returns the node specs of a source block `name`: the
 * wrapper and its source
 */
export const sourceBlockSpecs = (
  name: string,
  {
    attrs,
    caps = {},
    group = "top_block",
    check = (read) => read as Attrs,
  }: SourceBlockOptions,
): Record<string, NodeSpec> => ({
  [name]: {
    group,
    content: `${name}_source`,
    isolating: true,
    defining: true,
    selectable: true,
    sourceBlock: true,
    blockCaps: caps,
    attrs,
    // in the editor's DOM, and so on the clipboard, a figure that holds its
    // attributes as JSON, which a paste checks
    parseDOM: [
      {
        tag: `figure[data-blank-${name}]`,
        getAttrs: (dom) => {
          try {
            const read = JSON.parse(
              dom.getAttribute(`data-blank-${name}`) ?? "",
            ) as unknown;
            if (!read || typeof read !== "object") return false;
            return check(read as Record<string, unknown>) ?? false;
          } catch {
            return false;
          }
        },
      },
    ],
    toDOM: (node) => [
      "figure",
      {
        class: `source-block ${name}`,
        [`data-blank-${name}`]: JSON.stringify(node.attrs),
      },
      0,
    ],
  },
  [`${name}_source`]: {
    content: "text*",
    marks: "",
    code: true,
    defining: true,
    parseDOM: [
      {
        tag: `pre[data-blank-source="${name}"]`,
        preserveWhitespace: "full",
        context: `${name}/`,
        priority: 60,
      },
    ],
    toDOM: () => ["pre", { "data-blank-source": name }, ["code", 0]],
  },
});

/**
 * sourceOf returns the source a source block holds
 */
export const sourceOf = (block: Node) => block.firstChild?.textContent ?? "";

/**
 * createSourceBlock makes a source block `name` holding `source`
 */
export const createSourceBlock = (
  schema: Schema,
  name: string,
  source: string,
  attrs?: Attrs,
): Node => {
  const text = schema.nodes[`${name}_source`].create(
    null,
    // an empty text node can't be
    source ? schema.text(source) : null,
  );
  return schema.nodes[name].create(attrs, text);
};

/**
 * isSourceBlock tells whether `node` is a source block's wrapper
 */
export const isSourceBlock = (node: Node) =>
  node.type.spec.sourceBlock === true;
