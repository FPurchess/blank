import type { Node } from "prosemirror-model";

import { definitionsSection, usedDefinitions } from "./blocks/definitions";
import { settleForms } from "./blocks/forms";
import type { BlocksEnv } from "./blocks/rules";
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

export {
  closeMarker,
  fenceFor,
  formatMarker,
  parseMarker,
} from "./blocks/args";
export { formatAtom, readAtom } from "./blocks/atoms";
export {
  createForm,
  fieldAt,
  fieldSpec,
  fitForm,
  formBlocks,
  isEmptyField,
  settleForms,
} from "./blocks/forms";
export {
  checkDefinition,
  type Definition,
  definitionKey,
  definitionOf,
  type Definitions,
  docDefinitions,
  type FieldDefinition,
  formDefinition,
  readDefinition,
  readDefinitionList,
  usedDefinitions,
  writeDefinitionList,
} from "./blocks/definitions";
export {
  type FramePlace,
  type GridPlace,
  type Place,
  placesOf,
  trackWidths,
} from "./blocks/layout";
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
  const env: BlocksEnv = {};
  const doc = markdownParser.parse(body, env);
  // its forms as their definitions say, e.g. an empty title as a heading
  return settleForms(
    doc.type.create(
      {
        frontmatter,
        definitions: env.blankDefinitions ?? {},
        rawDefinitions: env.blankRawDefinitions ?? [],
      },
      doc.content,
    ),
  );
};

/**
 * serializeMarkdown writes a document as a markdown file, with its frontmatter
 * and the definitions of its forms at its end
 */
export const serializeMarkdown = (doc: Node): string => {
  const blocks = [
    markdownSerializer.serialize(doc),
    definitionsSection(
      usedDefinitions(doc),
      doc.attrs.rawDefinitions as readonly string[],
    ),
  ].filter(Boolean);
  return joinFrontmatter(frontmatterOf(doc), blocks.join("\n\n"));
};

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
