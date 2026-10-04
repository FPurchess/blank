import type JSZip from "jszip";

import {
  DEFINITIONS_NAMESPACE,
  FORM_TAG,
  readTag,
} from "../../exporters/docx/forms";
import {
  closeMarker,
  definitionOf,
  type Definitions,
  formatMarker,
  readDefinitionList,
} from "../../markdown";
import { PAGE_BREAK_STYLE } from "./pageBreaks";
import {
  child,
  children,
  isOn,
  customParts,
  markerParagraph,
  val,
  W,
} from "./xml";

// Forms from Word: a form is a group content control holding a content
// control per field, as Blank's Word export writes it (see
// src/exporters/docx/forms.ts), with the definitions in a Custom XML part.
// mammoth unwraps content controls and forgets their tags, so before the
// conversion each form becomes marker paragraphs holding its marker lines,
// around the content of its fields, which styleMap.ts and cleanup.ts turn
// into the form again. A field showing its placeholder is empty.

const DOCUMENT = "word/document.xml";

// the style of the marker paragraphs, matched by its id in styleMap.ts
export const FORM_STYLE = "BlankFormMarker";

/**
 * readDefinitions returns the definitions of forms the package holds, by
 * their key: the YAML of Blank's Custom XML part, the ones Blank can read
 */
export const readDefinitions = async (zip: JSZip): Promise<Definitions> =>
  Object.assign(
    {},
    ...(await customParts(zip, DEFINITIONS_NAMESPACE, "definitions")).map(
      readDefinitionList,
    ),
  ) as Definitions;

const marker = (doc: Document, line: string) =>
  markerParagraph(doc, FORM_STYLE, line);

const tagOf = (sdt: Element) => readTag(val(child(child(sdt, "sdtPr"), "tag")));

/**
 * contentOf returns what a content control holds
 */
const contentOf = (sdt: Element) => [
  ...(child(sdt, "sdtContent")?.children ?? []),
];

/**
 * isEmpty tells whether `node` is a paragraph without text or pictures
 */
const isEmpty = (node: Element) =>
  node.localName === "p" && node.getElementsByTagNameNS(W, "r").length === 0;

/**
 * takePageBreak takes the "page break before" the export put on a form's
 * first paragraph (see contentControls in src/exporters/docx/forms.ts) off
 * it, and the empty paragraph that held it before a table
 * @returns whether there was one
 */
const takePageBreak = (form: Element) => {
  const first = form.getElementsByTagNameNS(W, "p")[0];
  const pageBreak = child(child(first, "pPr"), "pageBreakBefore");
  if (!pageBreak || !isOn(pageBreak)) return false;
  if (isEmpty(first)) first.remove();
  else pageBreak.remove();
  return true;
};

/**
 * markForms rewrites word/document.xml with the marker paragraphs of each
 * form of Blank's, see the comment on top. The fields in the cells of a
 * grid's table come one column after the other, as in the form. What its
 * fields hold that isn't in a field of Blank's goes into the field before,
 * or the first one. A
 * page break before a form whose definition doesn't start a new page goes
 * before it.
 * @param zip the unpacked .docx file, changed in place
 * @param definitions the definitions the package holds
 * @returns whether it had to be rewritten
 */
export const markForms = async (zip: JSZip, definitions: Definitions) => {
  const xml = await zip.file(DOCUMENT)?.async("string");
  if (xml === undefined || !xml.includes(FORM_TAG)) return false;
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) return false;
  const body = doc.getElementsByTagNameNS(W, "body")[0];
  let changed = false;
  for (const sdt of children(body, "sdt")) {
    const tag = tagOf(sdt);
    if (!tag || !("form" in tag)) continue;
    const pageBreak =
      takePageBreak(sdt) && !definitionOf(definitions, tag.form)?.newPage;
    const fields: Element[] = [];
    // what comes before the first field
    const loose: Element[] = [];
    const take = (nodes: Element[], inGrid: boolean) => {
      for (const node of nodes) {
        const name = node.localName === "sdt" ? tagOf(node) : null;
        if (name && "grid" in name) {
          // the cells of its table, one column after the other
          for (const table of contentOf(node)) {
            for (const row of children(table, "tr")) {
              for (const cell of children(row, "tc")) {
                take([...cell.children], true);
              }
            }
          }
          continue;
        }
        if (!name || !("field" in name)) {
          // a cell's properties, and the paragraph a cell ends with
          if (node.localName === "tcPr" || (inGrid && isEmpty(node))) continue;
          const content = node.localName === "sdt" ? contentOf(node) : [node];
          (fields.length ? fields : loose).push(...content);
          continue;
        }
        fields.push(
          marker(
            doc,
            formatMarker({
              name: "field",
              format: null,
              args: { name: name.field },
            }),
          ),
          ...(fields.length ? [] : loose.splice(0)),
        );
        // a field showing its placeholder holds nothing
        if (isOn(child(child(node, "sdtPr"), "showingPlcHdr"))) continue;
        fields.push(...contentOf(node));
      }
    };
    take(contentOf(sdt), false);
    sdt.replaceWith(
      ...(pageBreak ? [markerParagraph(doc, PAGE_BREAK_STYLE)] : []),
      marker(
        doc,
        formatMarker({ name: "form", format: 1, args: { def: tag.form } }),
      ),
      ...fields,
      marker(doc, closeMarker("form")),
      ...loose,
    );
    changed = true;
  }
  if (changed) zip.file(DOCUMENT, new XMLSerializer().serializeToString(doc));
  return changed;
};
