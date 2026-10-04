import JSZip from "jszip";
import type { Attrs } from "prosemirror-model";

import type { Definition } from "../../markdown";
import { addDefinitions, addEmbeds, contentControls } from "./forms";
import { CODE_FONT, TOC_NAME } from "./template";

// Fixes to the package docx 9.7.2 writes, applied to the zipped document.

const COMMENTS = "word/comments.xml";
const STYLES = "word/styles.xml";
const FONT_TABLE = "word/fontTable.xml";

const read = (zip: JSZip, name: string) => zip.file(name)?.async("string");

const rewrite = async (
  zip: JSZip,
  name: string,
  change: (xml: string) => string,
) => {
  const xml = await read(zip, name);
  if (xml !== undefined) zip.file(name, change(xml));
};

/**
 * stripEmptyComments removes the empty comments part docx writes into every
 * document. Google Drive refuses to preview a document with it
 * (https://github.com/dolanmiu/docx/issues/3506, fixed after 9.7.2).
 */
const stripEmptyComments = async (zip: JSZip) => {
  const comments = await read(zip, COMMENTS);
  if (comments === undefined || /<w:comment\b/.test(comments)) return;

  zip.remove(COMMENTS);
  zip.remove("word/_rels/comments.xml.rels");
  await rewrite(zip, "word/_rels/document.xml.rels", (xml) =>
    xml.replace(/<Relationship\b[^>]*Target="comments\.xml"[^>]*\/>/g, ""),
  );
  await rewrite(zip, "[Content_Types].xml", (xml) =>
    xml.replace(
      /<Override\b[^>]*PartName="\/word\/comments\.xml"[^>]*\/>/g,
      "",
    ),
  );
};

/**
 * markNormalAsDefault makes the Normal style the default paragraph style.
 * docx can't set the flag, and pandoc misses headings (among others) when
 * no paragraph style is the default.
 */
const markNormalAsDefault = (zip: JSZip) =>
  rewrite(zip, STYLES, (xml) =>
    xml.replace(
      /<w:style w:type="paragraph" w:styleId="Normal">/,
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">',
    ),
  );

/**
 * markCodeFontFixed gives the font of code a fixed pitch and the family of
 * monospaced fonts in the font table: docx writes every embedded font as of
 * variable pitch, so a reader without the embedded font got a proportional
 * one in its place, and the columns of code lost their alignment
 */
const markCodeFontFixed = (zip: JSZip) =>
  rewrite(zip, FONT_TABLE, (xml) =>
    xml.replace(
      new RegExp(`<w:font w:name="${CODE_FONT}">.*?</w:font>`, "s"),
      (font) =>
        font
          .replace(/<w:pitch w:val="[^"]*"\/>/, '<w:pitch w:val="fixed"/>')
          .replace(/<w:family w:val="[^"]*"\/>/, '<w:family w:val="modern"/>'),
    ),
  );

/**
 * markTocs marks the tables of contents docx writes as Word's own, from its
 * gallery of tables of contents: Word then offers its tools for them, and
 * Blank's import knows them by it (src/importers/docx/toc.ts). docx writes
 * only their alias.
 */
const markTocs = (zip: JSZip) =>
  rewrite(zip, "word/document.xml", (xml) =>
    xml.replaceAll(
      `<w:sdtPr><w:alias w:val="${TOC_NAME}"/></w:sdtPr>`,
      `<w:sdtPr><w:alias w:val="${TOC_NAME}"/><w:docPartObj><w:docPartGallery w:val="${TOC_NAME}"/><w:docPartUnique/></w:docPartObj></w:sdtPr>`,
    ),
  );

/**
 * fixPackage applies the fixes to a .docx file written by docx, and adds
 * what it can't write: content controls, the definitions of forms and the
 * embeds
 * @param contents the .docx file
 * @returns the fixed .docx file
 */
export const fixPackage = async (
  contents: Uint8Array,
  {
    definitions = [],
    embeds = {},
  }: {
    definitions?: readonly Definition[];
    // the embeds' attributes, by their ids
    embeds?: Record<string, Attrs>;
  } = {},
) => {
  const zip = await JSZip.loadAsync(contents);
  await contentControls(zip);
  if (definitions.length) await addDefinitions(zip, definitions);
  if (Object.keys(embeds).length) await addEmbeds(zip, embeds);
  await stripEmptyComments(zip);
  await markNormalAsDefault(zip);
  await markCodeFontFixed(zip);
  await markTocs(zip);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
};
