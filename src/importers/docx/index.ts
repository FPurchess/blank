import { DOMParser as SchemaParser, type Node } from "prosemirror-model";
import { schema } from "prosemirror-markdown";

import { toDataUrl } from "../../images/dataUrl";
import { optimizeForMarkdown } from "../../images/optimize";
import { DROPPED_IMAGE_SRC, cleanup } from "./cleanup";
import { normalizeNumbering } from "./numbering";
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
  ...(report.tables
    ? [`${count(report.tables, "table", "tables")} became text`]
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
  const docx = await normalizeNumbering(bytes);

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
  const doc = SchemaParser.fromSchema(schema).parse(dom.body);

  const errors = messages
    .filter((message) => message.type === "error")
    .map((message) => message.message);
  return {
    doc,
    warnings: describe(report, errors),
  };
};
