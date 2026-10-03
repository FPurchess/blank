import type { Node } from "prosemirror-model";

import {
  frontmatterOf,
  joinFrontmatter,
  splitFrontmatter,
} from "./frontmatter";
import { markdownParser } from "./parser";
import { markdownSerializer } from "./serializer";

// Blank's markdown: the schema with tables, the parser and serializer that
// read and write them, and the frontmatter. Import the schema, parser and
// serializer from here, never from prosemirror-markdown.

export { type Alignment, headerRowCount, isHeaderCell, schema } from "./schema";
export {
  type DocumentProperties,
  frontmatterError,
  frontmatterOf,
  propertiesOf,
  readFrontmatter,
  readProperties,
  setProperties,
  updateFrontmatter,
} from "./frontmatter";

export { markdownParser } from "./parser";
export { markdownSerializer } from "./serializer";
export { tokenizer } from "./tokenizer";

/**
 * parseMarkdown parses a markdown file, including its frontmatter
 * @param text the markdown file
 * @returns the document, which keeps the frontmatter in its attributes
 */
export const parseMarkdown = (text: string): Node => {
  const { frontmatter, body } = splitFrontmatter(text);
  const doc = markdownParser.parse(body);
  return doc.type.create({ frontmatter }, doc.content);
};

/**
 * serializeMarkdown writes a document as a markdown file, with its frontmatter
 */
export const serializeMarkdown = (doc: Node): string =>
  joinFrontmatter(frontmatterOf(doc), markdownSerializer.serialize(doc));

/**
 * firstHeading returns the text of the first heading, or "" if there is none
 */
export const firstHeading = (doc: Node) => {
  let title = "";
  doc.descendants((node) => {
    if (!title && node.type.name === "heading") title = node.textContent;
    return !title;
  });
  return title;
};
