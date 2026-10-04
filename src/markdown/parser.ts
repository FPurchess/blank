import { defaultMarkdownParser, MarkdownParser } from "prosemirror-markdown";
import type { Attrs, Node, NodeType } from "prosemirror-model";

import { ATOMS } from "./blocks/atoms";
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
  token: { meta: { table: Node } },
) => void;

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

// the html_table rule of the tokenizer has already read the table
(
  markdownParser as unknown as { tokenHandlers: Record<string, TokenHandler> }
).tokenHandlers.html_table = (state, { meta: { table } }) => {
  state.addNode(table.type, table.attrs, table.children);
};
