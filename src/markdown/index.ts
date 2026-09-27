import {
  MarkdownParser,
  MarkdownSerializer,
  defaultMarkdownParser,
  defaultMarkdownSerializer,
} from "prosemirror-markdown";
import type { Node } from "prosemirror-model";

import { joinFrontmatter, splitFrontmatter } from "./frontmatter";
import { schema } from "./schema";

// Blank's markdown: the stock prosemirror-markdown parser and serializer on
// Blank's schema, plus the frontmatter. Import the schema, parser and
// serializer from here, never from prosemirror-markdown.

export { schema };
export {
  type DocumentProperties,
  propertiesOf,
  readFrontmatter,
  readProperties,
  setProperties,
} from "./frontmatter";

export const markdownParser = new MarkdownParser(
  schema,
  defaultMarkdownParser.tokenizer,
  defaultMarkdownParser.tokens,
);

export const markdownSerializer = new MarkdownSerializer(
  {
    ...defaultMarkdownSerializer.nodes,
    horizontal_rule(state, node, parent, index) {
      // a file that starts with `---` would open with the text up to the next
      // `---` as its frontmatter, so a rule on top is written as `***`
      const onTop =
        index === 0 &&
        parent.type === schema.topNodeType &&
        parent.attrs.frontmatter === null;
      state.write(onTop ? "***" : (node.attrs.markup as string) || "---");
      state.closeBlock(node);
    },
  },
  defaultMarkdownSerializer.marks,
);

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
  joinFrontmatter(
    doc.attrs.frontmatter as string | null,
    markdownSerializer.serialize(doc),
  );

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
