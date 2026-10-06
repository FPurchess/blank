import { DOMParser as SchemaParser, type Node } from "prosemirror-model";

import { toDataUrl } from "../../images/dataUrl";
import { optimizeForMarkdown } from "../../images/optimize";
import { config } from "../../config";
import { localeUnit } from "../../layout/paper";
import { describePaper } from "../../layout/describe";
import { resolveLayout } from "../../layout/resolve";
import { type PageSettings, writePageSettings } from "../../layout/settings";
import {
  firstHeading,
  readProperties,
  schema,
  setProperties,
  settleForms,
  updateFrontmatter,
  withoutNestedAlignment,
} from "../../markdown";
import { mapTables, withColumnAlignment } from "../../markdown/tables";
import { withoutLinkUnderline } from "../../markdown/marks";
import { DROPPED_IMAGE_SRC, cleanup } from "./cleanup";
import { type WordLayout, pageChanges } from "./layout";
import { type WordProperties, prepareDocx } from "./prepare";
import { STYLE_MAP } from "./styleMap";
import { hideTabs, showTabs } from "./tabs";
import { readZipDirectory } from "./zipGuard";

export interface ImportResult {
  doc: Node;
  // what the markdown document couldn't keep, shown after the import
  warnings: string[];
  // the page setup that came along, e.g. "Letter landscape", or null if the
  // document has none or it is the one it was exported with
  page: string | null;
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
 * withProperties sets the title and author Word has into the frontmatter,
 * since they may have been changed there
 */
const withProperties = (
  frontmatter: string | null,
  properties: WordProperties,
  doc: Node,
) => {
  const before = readProperties(frontmatter);
  const values: Record<string, string | undefined> = {};
  // the exports fall back to the first heading, so a title that matches it
  // needs no frontmatter
  const title =
    properties.title === firstHeading(doc) ? undefined : properties.title;
  if (properties.title !== before.title) values.title = title;
  if (properties.author !== before.author) values.author = properties.author;
  return setProperties(frontmatter, values);
};

/**
 * frontmatterOf returns the frontmatter of an imported document: the one
 * Blank kept in a document it exported, with what Word has now
 * @returns the frontmatter, and the page setup that came along or null
 */
const frontmatterOf = (
  properties: WordProperties,
  layout: WordLayout,
  doc: Node,
  defaults: PageSettings,
) => {
  let frontmatter = withProperties(
    properties.frontmatter ?? null,
    properties,
    doc,
  );
  if (!layout.page) return { frontmatter, page: null };

  const changes = pageChanges(frontmatter, layout.page, defaults);
  if (Object.keys(changes).length === 0) return { frontmatter, page: null };
  frontmatter = updateFrontmatter(frontmatter, (document) =>
    writePageSettings(document, changes, localeUnit()),
  );
  const page = describePaper(
    resolveLayout(frontmatter, defaults).layout,
    localeUnit(),
  );
  return { frontmatter, page };
};

/**
 * importDocx converts a Word document into a markdown document. Images are
 * kept inside it as data: URLs.
 * @param bytes the .docx file
 * @param defaults the user's default page setup
 * @returns the document and what it couldn't keep
 * @throws if the file isn't a Word document or is too large
 */
export const importDocx = async (
  bytes: Uint8Array,
  defaults: PageSettings = config.value.layout.page,
): Promise<ImportResult> => {
  // refuses what isn't a Word document, or unpacks to too much
  readZipDirectory(bytes);
  const { default: mammoth } = await import("mammoth");
  const {
    bytes: docx,
    properties,
    layout,
    definitions,
  } = await prepareDocx(bytes);

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
  hideTabs(dom.body);
  const parsed = showTabs(SchemaParser.fromSchema(schema).parse(dom.body));
  // only blocks at the top keep an alignment (src/markdown/alignment.ts), a
  // column keeps the alignment its body cells agree on, as markdown aligns
  // columns, and links lose an underline Word users gave them
  const body = withoutNestedAlignment(
    parsed.copy(
      withoutLinkUnderline(mapTables(parsed.content, withColumnAlignment)),
    ),
  );
  const { frontmatter, page } = frontmatterOf(
    properties,
    layout,
    body,
    defaults,
  );
  // the forms as their definitions say, whatever a Word user did to them
  const doc = settleForms(
    body.type.create({ frontmatter, definitions }, body.content),
  );

  const errors = messages
    .filter((message) => message.type === "error")
    .map((message) => message.message);
  return {
    doc,
    warnings: [...describe(report, errors), ...layout.warnings],
    page,
  };
};
