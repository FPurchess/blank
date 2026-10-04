import type JSZip from "jszip";
import type { Attrs } from "prosemirror-model";

import { type Definition, writeDefinitionList } from "../../markdown";

// Forms in Word: a form is a group content control, locked, holding a
// content control per field, each named by its label and locked, so a Word
// user fills them in but can't take them apart. An empty field shows its
// placeholder, as Word's own do. The definitions go along in a Custom XML
// part, so that the Word import (src/importers/docx/forms.ts) makes forms of
// them again.
//
// docx can't write content controls, so the export writes a marker
// paragraph where each one opens and closes, and `contentControls` turns
// them into content controls in the package.

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const DOCUMENT = "word/document.xml";

// the styles of the marker paragraphs, which no document keeps
export const CONTROL_OPEN = "BlankControlOpen";
export const CONTROL_CLOSE = "BlankControlClose";

// what a content control is: its tag, which says what it is to Blank, the
// name Word shows, and whether it is a form or shows its placeholder
export interface Control {
  tag: string;
  alias: string;
  group?: boolean;
  placeholder?: boolean;
}

// the tags of a form and a field, which the import knows them by
export const FORM_TAG = "blank:form@1:";
const FIELD_TAG = "blank:field:";
// the tag of a grid's table, whose cells hold the fields of its columns
export const GRID_TAG = "blank:grid";
// the tag of an embed's picture, before its id
const EMBED_TAG = "blank:embed@1:";

export const formTag = (def: string) => `${FORM_TAG}${def}`;
export const embedTag = (id: string) => `${EMBED_TAG}${id}`;
export const fieldTag = (name: string) => `${FIELD_TAG}${name}`;

/**
 * readTag returns what a content control's tag says: the key of a form's
 * definition, a field's name, a grid, or an embed's id; null for a content
 * control not Blank's
 */
export const readTag = (
  tag: string | null,
):
  | { form: string }
  | { field: string }
  | { grid: true }
  | { embed: string }
  | null => {
  if (tag?.startsWith(FORM_TAG)) return { form: tag.slice(FORM_TAG.length) };
  if (tag?.startsWith(EMBED_TAG)) return { embed: tag.slice(EMBED_TAG.length) };
  if (tag?.startsWith(FIELD_TAG)) return { field: tag.slice(FIELD_TAG.length) };
  if (tag === GRID_TAG) return { grid: true };
  return null;
};

// the namespace of the Custom XML part that holds the definitions
export const DEFINITIONS_NAMESPACE =
  "https://blank-writer.xyz/2026/definitions";
// and the one that holds the embeds
export const EMBEDS_NAMESPACE = "https://blank-writer.xyz/2026/embeds";

const element = (doc: Document, name: string, val?: string) => {
  const made = doc.createElementNS(W, `w:${name}`);
  if (val !== undefined) made.setAttributeNS(W, "w:val", val);
  return made;
};

const children = (parent: Element, name: string) =>
  [...parent.children].filter(
    (child) => child.namespaceURI === W && child.localName === name,
  );

/**
 * markerOf returns what a marker paragraph opens, "close" for one that
 * closes, or null for another element
 */
const markerOf = (node: Element): Control | "close" | null => {
  if (node.localName !== "p") return null;
  const style = children(children(node, "pPr")[0] ?? node, "pStyle")[0];
  const name = style?.getAttributeNS(W, "val");
  if (name === CONTROL_CLOSE) return "close";
  if (name !== CONTROL_OPEN) return null;
  return JSON.parse(node.textContent ?? "{}") as Control;
};

/**
 * startPage gives a paragraph "page break before", in its properties' order
 */
const startPage = (doc: Document, p: Element) => {
  let pPr = children(p, "pPr")[0];
  if (!pPr) {
    pPr = element(doc, "pPr");
    p.prepend(pPr);
  }
  const before = ["pStyle", "keepNext", "keepLines"];
  const after = [...pPr.children].find(
    (child) => !before.includes(child.localName),
  );
  pPr.insertBefore(element(doc, "pageBreakBefore"), after ?? null);
};

/**
 * controlOf makes the content control a marker opens, with its content
 */
const controlOf = (doc: Document, control: Control) => {
  const sdt = element(doc, "sdt");
  const properties = element(doc, "sdtPr");
  properties.append(
    element(doc, "alias", control.alias),
    element(doc, "tag", control.tag),
    element(doc, "lock", "sdtLocked"),
  );
  if (control.placeholder) properties.append(element(doc, "showingPlcHdr"));
  if (control.group) properties.append(element(doc, "group"));
  const content = element(doc, "sdtContent");
  sdt.append(properties, content);
  return { sdt, content };
};

/**
 * contentControls turns the marker paragraphs of the body, and of the cells
 * of a grid's table, into content controls around what they hold. A marker's "page break before" goes on to
 * the first paragraph it holds, or an empty one before a table, which can't
 * have it.
 */
export const contentControls = async (zip: JSZip) => {
  const xml = await zip.file(DOCUMENT)?.async("string");
  if (xml === undefined || !xml.includes(CONTROL_OPEN)) return;
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("The document of the Word file can't be read");
  }
  const body = doc.getElementsByTagNameNS(W, "body")[0];
  wrapControls(doc, body);
  // the fields in the cells of grids
  for (const cell of [...doc.getElementsByTagNameNS(W, "tc")]) {
    wrapControls(doc, cell);
  }
  zip.file(DOCUMENT, new XMLSerializer().serializeToString(doc));
};

/**
 * wrapControls turns the marker paragraphs among the children of `root`
 * into content controls, see contentControls
 */
const wrapControls = (doc: Document, root: Element) => {
  let container: Element = root;
  const open: Element[] = [];
  let pageBreak = false;
  for (const node of [...root.children]) {
    const marker = markerOf(node);
    if (marker === "close") {
      container = open.pop() ?? root;
      node.remove();
      continue;
    }
    if (marker) {
      const { sdt, content } = controlOf(doc, marker);
      pageBreak ||=
        node.getElementsByTagNameNS(W, "pageBreakBefore").length > 0;
      container.insertBefore(sdt, container === root ? node : null);
      node.remove();
      open.push(container);
      container = content;
      continue;
    }
    if (pageBreak && node.localName === "tbl") {
      const p = element(doc, "p");
      startPage(doc, p);
      container.insertBefore(p, container === root ? node : null);
      pageBreak = false;
    }
    if (pageBreak && node.localName === "p") {
      startPage(doc, node);
      pageBreak = false;
    }
    if (container !== root) container.append(node);
  }
};

const escapeXml = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// a Custom XML part of Blank's: its number in customXml/, the element
// that holds it, its namespace and the id Word knows it by
interface CustomPart {
  number: number;
  root: string;
  namespace: string;
  id: string;
}

const DEFINITIONS_PART: CustomPart = {
  number: 1,
  root: "definitions",
  namespace: DEFINITIONS_NAMESPACE,
  id: "{6B8E2D7A-2B4C-4E4B-9C1A-5F0A3B1D7E21}",
};

const EMBEDS_PART: CustomPart = {
  number: 2,
  root: "embeds",
  namespace: EMBEDS_NAMESPACE,
  id: "{2F1C8B4E-7D3A-4C9E-8B6F-1A5E9D0C3B72}",
};

/**
 * addCustomPart puts `text` in a Custom XML part of the package, which Word
 * keeps, see CustomPart
 */
const addCustomPart = async (zip: JSZip, part: CustomPart, text: string) => {
  const { number, root, namespace, id } = part;
  zip.file(
    `customXml/item${number}.xml`,
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<${root} xmlns="${namespace}">${escapeXml(text)}</${root}>`,
  );
  zip.file(
    `customXml/itemProps${number}.xml`,
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<ds:datastoreItem ds:itemID="${id}" xmlns:ds="http://schemas.openxmlformats.org/officeDocument/2006/customXml"><ds:schemaRefs><ds:schemaRef ds:uri="${namespace}"/></ds:schemaRefs></ds:datastoreItem>`,
  );
  zip.file(
    `customXml/_rels/item${number}.xml.rels`,
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXmlProps" Target="itemProps${number}.xml"/></Relationships>`,
  );
  const rels = "word/_rels/document.xml.rels";
  const relations = await zip.file(rels)?.async("string");
  if (relations !== undefined) {
    zip.file(
      rels,
      relations.replace(
        "</Relationships>",
        `<Relationship Id="rIdBlank${root}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/customXml" Target="../customXml/item${number}.xml"/></Relationships>`,
      ),
    );
  }
  const types = "[Content_Types].xml";
  const content = await zip.file(types)?.async("string");
  if (content !== undefined) {
    const xmlDefault = /<Default\b[^>]*Extension="xml"/.test(content)
      ? ""
      : '<Default Extension="xml" ContentType="application/xml"/>';
    zip.file(
      types,
      content.replace(
        "</Types>",
        `${xmlDefault}<Override PartName="/customXml/itemProps${number}.xml" ContentType="application/vnd.openxmlformats-officedocument.customXmlProperties+xml"/></Types>`,
      ),
    );
  }
};

/**
 * addDefinitions puts the definitions of the forms, as YAML, in a Custom XML
 * part of the package
 */
export const addDefinitions = (
  zip: JSZip,
  definitions: readonly Definition[],
) => addCustomPart(zip, DEFINITIONS_PART, writeDefinitionList(definitions));

/**
 * addEmbeds puts the embeds, their attributes by their ids as JSON, in a
 * Custom XML part of the package, so that the Word import makes embeds of
 * the pictures that show them again
 */
export const addEmbeds = (zip: JSZip, embeds: Record<string, Attrs>) =>
  addCustomPart(zip, EMBEDS_PART, JSON.stringify(embeds));
