import { DOMParser as SchemaParser, type Node } from "prosemirror-model";

import { toDataUrl } from "../../images/dataUrl";
import { optimizeForMarkdown } from "../../images/optimize";
import {
  firstHeading,
  readProperties,
  schema,
  setProperties,
} from "../../markdown";
import { DROPPED_IMAGE_SRC, cleanup } from "./cleanup";
import { type WordProperties, prepareDocx } from "./prepare";
import { STYLE_MAP } from "./styleMap";
import { readZipDirectory } from "./zipGuard";

export interface ImportResult {
  doc: Node;
  // what the markdown document couldn't keep, shown after the import
  warnings: string[];
}

const count = (n: number, one: string, many: string) =>
  `${n} ${n === 1 ? one : many}`;

const describe = (report: ReturnType<typeof cleanup>, errors: string[]) => [
  ...(report.nestedTables
    ? [
        `${count(report.nestedTables, "table inside a table", "tables inside tables")} became text`,
      ]
    : []),
  ...(report.droppedImages
    ? [`${count(report.droppedImages, "image", "images")} couldn't be imported`]
    : []),
  ...(report.footnotes
    ? [`${count(report.footnotes, "footnote", "footnotes")} moved to the end`]
    : []),
  ...(report.comments
    ? [`${count(report.comments, "comment", "comments")} left out`]
    : []),
  ...errors,
];

/**
 * frontmatterOf returns the frontmatter of an imported document: the one
 * Blank kept in a document it exported, with the title and author Word has
 * now, since they may have been changed there
 */
const frontmatterOf = (properties: WordProperties, doc: Node) => {
  const kept = properties.frontmatter ?? null;
  const before = readProperties(kept);
  const values: Record<string, string | undefined> = {};
  // the exports fall back to the first heading, so a title that matches it
  // needs no frontmatter
  const title =
    properties.title === firstHeading(doc) ? undefined : properties.title;
  if (properties.title !== before.title) values.title = title;
  if (properties.author !== before.author) values.author = properties.author;
  return setProperties(kept, values);
};

/**
 * importDocx converts a Word document into a markdown document. Images are
 * kept inside it as data: URLs.
 * @param bytes the .docx file
 * @returns the document and what it couldn't keep
 * @throws if the file isn't a Word document or is too large
 */
export const importDocx = async (bytes: Uint8Array): Promise<ImportResult> => {
  // refuses what isn't a Word document, or unpacks to too much
  readZipDirectory(bytes);
  const { default: mammoth } = await import("mammoth");
  const { bytes: docx, properties } = await prepareDocx(bytes);

  const { value: html, messages } = await mammoth.convertToHtml(
    // the browser build of mammoth reads `arrayBuffer`, the Node build (in
    // tests) reads `buffer`
    {
      arrayBuffer: docx.buffer.slice(
        docx.byteOffset,
        docx.byteOffset + docx.byteLength,
      ),
      buffer: docx,
    } as unknown as { arrayBuffer: ArrayBuffer },
    {
      styleMap: STYLE_MAP,
      // empty paragraphs are removed in cleanup, after the ones of horizontal
      // lines have become <hr>
      ignoreEmptyParagraphs: false,
      // never read files a document links to, see CVE-2025-11849
      externalFileAccess: false,
      convertImage: mammoth.images.imgElement(async (image) => {
        const optimized = await optimizeForMarkdown(
          new Uint8Array(await image.readAsArrayBuffer()),
          image.contentType,
        );
        return {
          src: optimized
            ? await toDataUrl(optimized.bytes, optimized.mime)
            : DROPPED_IMAGE_SRC,
        };
      }),
    },
  );

  // an inert document: nothing in it runs or loads
  const dom = new DOMParser().parseFromString(html, "text/html");
  const report = cleanup(dom);
  const body = SchemaParser.fromSchema(schema).parse(dom.body);
  const doc = body.type.create(
    { frontmatter: frontmatterOf(properties, body) },
    body.content,
  );

  const errors = messages
    .filter((message) => message.type === "error")
    .map((message) => message.message);
  return {
    doc,
    warnings: describe(report, errors),
  };
};
