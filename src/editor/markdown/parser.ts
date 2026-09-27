import { defaultMarkdownParser, MarkdownParser } from "prosemirror-markdown";
import type { Attrs, Node, NodeType } from "prosemirror-model";

import { alignment, schema } from "../schema";
import { parseHtmlTable } from "./html";
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

type TokenHandler = (state: ParseState, token: { content: string }) => void;

/**
 * parser reads markdown into a document of Blank's schema, pipe tables and
 * HTML tables included
 */
export const parser = new MarkdownParser(
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
  },
);

// an HTML table becomes a table, or stays text if it can't be read
(
  parser as unknown as { tokenHandlers: Record<string, TokenHandler> }
).tokenHandlers.html_table = (state, token) => {
  const table = parseHtmlTable(token.content);
  if (table) {
    state.addNode(table.type, table.attrs, table.content.content);
    return;
  }
  const text = token.content.replace(/\n+$/, "");
  state.addNode(schema.nodes.paragraph, null, [schema.text(text)]);
};
