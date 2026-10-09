import JSZip from "jszip";

import { FRONTMATTER_PROPERTY } from "../../exporters/docx/properties";
import { readWordLayout, type WordLayout } from "./layout";
import { normalizeNumbering } from "./numbering";
import { markPageBreaks } from "./pageBreaks";
import { markAlignment } from "./align";
import { markTocs } from "./toc";
import { markForms, readDefinitions } from "./forms";
import { markDiagrams, markEmbeds, readDiagrams, readEmbeds } from "./embeds";
import type { Definitions } from "../../markdown";
import { parsePart } from "./xml";
import { markPictureWidths } from "./widths";

// Reads what mammoth leaves out of a .docx and rewrites what it would get
// wrong, on the package unpacked once.

const CORE = "docProps/core.xml";
const CUSTOM = "docProps/custom.xml";
const DC = "http://purl.org/dc/elements/1.1/";
// Word's placeholder for documents nobody named an author for
const NO_AUTHOR = "Un-named";

export interface WordProperties {
  title?: string;
  author?: string;
  // the frontmatter of a document Blank exported, see
  // src/exporters/docx/index.ts
  frontmatter?: string;
}

const textOf = (doc: Document, namespace: string, name: string) =>
  doc.getElementsByTagNameNS(namespace, name)[0]?.textContent?.trim() ||
  undefined;

/**
 * readWordProperties reads the title and author of a Word document, and the
 * frontmatter Blank keeps in its custom properties
 */
export const readWordProperties = async (
  zip: JSZip,
): Promise<WordProperties> => {
  const properties: WordProperties = {};
  const core = await parsePart(zip, CORE);
  if (core) {
    const title = textOf(core, DC, "title");
    const author = textOf(core, DC, "creator");
    if (title) properties.title = title;
    if (author && author !== NO_AUTHOR) properties.author = author;
  }
  const custom = await parsePart(zip, CUSTOM);
  const property = custom
    ? [...custom.getElementsByTagName("*")].find(
        (element) =>
          element.localName === "property" &&
          element.getAttribute("name") === FRONTMATTER_PROPERTY,
      )
    : undefined;
  if (property) properties.frontmatter = property.textContent ?? "";
  return properties;
};

export interface PreparedDocx {
  // the .docx file for mammoth
  bytes: Uint8Array;
  properties: WordProperties;
  layout: WordLayout;
  // the definitions of the forms in it, by their key
  definitions: Definitions;
}

/**
 * prepareDocx unpacks a .docx once to read its properties and to rewrite what
 * mammoth would get wrong
 * @param bytes the .docx file
 * @returns the file for mammoth, rewritten if it had to be, and its properties
 */
export const prepareDocx = async (bytes: Uint8Array): Promise<PreparedDocx> => {
  const zip = await JSZip.loadAsync(bytes);
  // read before the rewrites, which split paragraphs with their properties
  const properties = await readWordProperties(zip);
  const layout = await readWordLayout(zip);
  const definitions = await readDefinitions(zip);
  const embeds = await markEmbeds(zip, await readEmbeds(zip));
  const diagrams = await markDiagrams(zip, await readDiagrams(zip));
  const widths = await markPictureWidths(zip);
  // before the page breaks, which split paragraphs a field may span
  const tocs = await markTocs(zip);
  const forms = await markForms(zip, definitions);
  const numbering = await normalizeNumbering(zip);
  const pageBreaks = await markPageBreaks(zip);
  // after the page breaks, so each piece of a split paragraph gets its own
  const aligned = await markAlignment(zip);
  return {
    bytes:
      tocs ||
      forms ||
      embeds ||
      diagrams ||
      widths ||
      numbering ||
      pageBreaks ||
      aligned
        ? await zip.generateAsync({ type: "uint8array" })
        : bytes,
    properties,
    layout,
    definitions,
  };
};
