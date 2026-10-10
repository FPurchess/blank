import { defaultMarkdownParser, MarkdownParser } from "prosemirror-markdown";
import type { Attrs, Node, NodeType } from "prosemirror-model";

import { ATOMS } from "./blocks/atoms";
import { parseWidth } from "./blocks/caps";
import { createSourceBlock } from "./blocks/sourceBlock";
import { textAlignment } from "./alignment";
import { alignment, schema } from "./schema";
import { tokenizer } from "./tokenizer";

/**
 * cellAttrs reads a cell's alignment from the `style` markdown-it gives it
 */
const cellAttrs = (token: { attrGet(name: string): string | null }) => ({
  align: alignment(
    /text-align:\s*(\w+)/.exec(token.attrGet("style") ?? "")?.[1],
  ),
});

// the part of prosemirror-markdown's parse state a token handler needs
interface ParseState {
  addNode(type: NodeType, attrs: Attrs | null, content?: readonly Node[]): Node;
}

type TokenHandler = (
  state: ParseState,
  token: { meta: { node: Node } },
) => void;

// an image's width, if Blank can lay it out; one it can't is left out
const readWidth = (width: string | null | undefined) =>
  width && parseWidth(width) ? width : null;

// a paragraph's or heading's alignment, from the <div align> around it (see
// alignBlocks in ./tokenizer.ts)
const blockAlign = (token: { attrGet(name: string): string | null }) =>
  textAlignment(token.attrGet("data-align"));

/**
 * markdownParser reads markdown into a document of Blank's schema, pipe tables and
 * HTML tables included
 */
export const markdownParser = new MarkdownParser(
  schema,
  // prosemirror-markdown is typed against its own copy of markdown-it
  tokenizer as unknown as MarkdownParser["tokenizer"],
  {
    ...defaultMarkdownParser.tokens,
    paragraph: {
      block: "paragraph",
      getAttrs: (token) => ({ align: blockAlign(token) }),
    },
    heading: {
      block: "heading",
      getAttrs: (token) => ({
        level: Number(token.tag.slice(1)),
        align: blockAlign(token),
      }),
    },
    underline: { mark: "underline" },
    // with the width of an <img> (see htmlImage in ./tokenizer.ts)
    image: {
      node: "image",
      getAttrs: (token) => ({
        src: token.attrGet("src"),
        title: token.attrGet("title") || null,
        alt: token.children?.[0]?.content || null,
        width: readWidth(
          (token.meta as { width?: string | null } | null)?.width,
        ),
      }),
    },
    table: { block: "table" },
    thead: { ignore: true },
    tbody: { ignore: true },
    tr: { block: "table_row" },
    th: { block: "table_header", getAttrs: cellAttrs },
    td: { block: "table_cell", getAttrs: cellAttrs },
    page_break: { node: "page_break" },
    ...Object.fromEntries(
      Object.values(ATOMS).map((atom) => [
        atom.node,
        {
          node: atom.node,
          getAttrs: (token: { meta: { attrs: Attrs } }) => token.meta.attrs,
        },
      ]),
    ),
    embed: {
      node: "embed",
      getAttrs: (token: { meta: { attrs: Attrs } }) => token.meta.attrs,
    },
    form_block: {
      block: "form_block",
      getAttrs: (token: { meta: { attrs: Attrs } }) => token.meta.attrs,
    },
    form_field: {
      block: "form_field",
      getAttrs: (token: { meta: { attrs: Attrs } }) => token.meta.attrs,
    },
    unknown_block: {
      node: "unknown_block",
      getAttrs: (token) => ({ raw: (token.meta as { raw: string }).raw }),
    },
  },
);

// the html_table and align_wrapper rules of the tokenizer have already read
// the node, a table or a paragraph or heading
const handlers = (
  markdownParser as unknown as { tokenHandlers: Record<string, TokenHandler> }
).tokenHandlers;
const addParsed: TokenHandler = (state, { meta: { node } }) => {
  state.addNode(node.type, node.attrs, node.children);
};
// a diagram, from its fence (see diagramFences in ./blocks/rules.ts): its
// source goes into its source node
handlers.diagram = (state, token) => {
  const { attrs, source } = token.meta as unknown as {
    attrs: Attrs;
    source: string;
  };
  const block = createSourceBlock(schema, "diagram", source, attrs);
  state.addNode(block.type, block.attrs, block.children);
};
handlers.html_table = addParsed;
handlers.html_block_node = addParsed;
