import type JSZip from "jszip";

import { TOC_NAME } from "../../exporters/docx/template";
import { formatAtom } from "../../markdown";
import { child, markerParagraph, val, W } from "./xml";

// A table of contents in a Word document is a field, TOC, whose result is
// its entries as Word last laid them out, usually in a content control from
// Word's gallery of tables of contents (as Word, LibreOffice, pandoc and
// Blank write it). mammoth reads the entries as paragraphs and loses the
// field, so before the conversion each table of contents becomes a marker
// paragraph, which styleMap.ts and cleanup.ts turn into Blank's table of
// contents: its entries are written again from the document's headings.

const DOCUMENT = "word/document.xml";

// the style of the marker paragraphs, matched by its id in styleMap.ts; the
// paragraph holds the table of contents' marker line (src/markdown/blocks)
export const TOC_STYLE = "BlankToc";
// the style of a table of contents' title, Word's own
const TITLE_STYLE = "TOCHeading";

const styleOf = (p: Element) => val(child(child(p, "pPr"), "pStyle"));

const isElement = (node: Node | null, name: string): node is Element =>
  node instanceof Element && node.namespaceURI === W && node.localName === name;

/**
 * depthOf reads how deep a TOC field lists headings from its instruction,
 * `TOC \o "1-3" \h`: the last level of `\o`, 3 without one, at most 6
 */
const depthOf = (instruction: string) => {
  const range = /\\o\s+"\s*(\d)\s*-\s*(\d)\s*"/.exec(instruction);
  if (!range) return 3;
  return Math.min(6, Math.max(1, Number(range[2])));
};

/**
 * isToc tells whether a field instruction is a table of contents of
 * headings: a table of figures (`\c "Figure"`) lists captions instead.
 * LibreOffice writes `\f` in its tables of contents of headings too.
 */
const isToc = (instruction: string) =>
  /^\s*TOC\b/i.test(instruction) && !/\\c\b/.test(instruction);

const instructionsIn = (element: Element) =>
  [...element.getElementsByTagNameNS(W, "instrText")]
    .map((text) => text.textContent ?? "")
    .join("");

/**
 * marker returns the marker paragraph of a table of contents
 */
const marker = (doc: Document, depth: number, title: string) =>
  markerParagraph(
    doc,
    TOC_STYLE,
    formatAtom("toc", { depth, title, extra: {} }),
  );

/**
 * textBeside tells whether `paragraph` has text before (`side` -1) or after
 * (1) `char`, a field's begin or end: text that isn't the field's
 */
const textBeside = (paragraph: Element, char: Element, side: -1 | 1) =>
  [...paragraph.getElementsByTagNameNS(W, "t")].some(
    (text) =>
      (text.textContent ?? "").trim() !== "" &&
      Boolean(
        char.compareDocumentPosition(text) &
        (side < 0
          ? Node.DOCUMENT_POSITION_PRECEDING
          : Node.DOCUMENT_POSITION_FOLLOWING),
      ),
  );

/**
 * takeTitle returns the title of a table of contents: a paragraph in Word's
 * style for it, inside the content control or right before it, which is
 * removed. "" for none.
 */
const takeTitle = (control: Element) => {
  const inside = [...control.getElementsByTagNameNS(W, "p")].find(
    (p) => styleOf(p) === TITLE_STYLE,
  );
  const before = control.previousElementSibling;
  const title =
    inside ??
    (isElement(before, "p") && styleOf(before) === TITLE_STYLE ? before : null);
  if (!title) return "";
  const text = (title.textContent ?? "").replace(/\s+/g, " ").trim();
  if (title === before) title.remove();
  return text;
};

/**
 * galleryTocs replaces the content controls of Word's gallery of tables of
 * contents
 */
const galleryTocs = (doc: Document) => {
  let changed = false;
  for (const control of [...doc.getElementsByTagNameNS(W, "sdt")]) {
    const gallery = child(
      child(child(control, "sdtPr"), "docPartObj"),
      "docPartGallery",
    );
    if (val(gallery) !== TOC_NAME) continue;
    // in a paragraph, it isn't a block
    if (!isElement(control.parentElement, "body")) continue;
    const instruction = instructionsIn(control);
    if (instruction && !isToc(instruction)) continue;
    const title = takeTitle(control);
    control.replaceWith(marker(doc, depthOf(instruction), title));
    changed = true;
  }
  return changed;
};

/**
 * fieldTocs replaces the TOC fields that aren't in a content control: the
 * paragraphs from the one the field begins in to the one it ends in
 */
const fieldTocs = (doc: Document) => {
  let changed = false;
  const body = doc.getElementsByTagNameNS(W, "body")[0];
  if (!body) return false;
  for (const p of [...body.children].filter((node) => isElement(node, "p"))) {
    if (!p.isConnected) continue;
    const begin = [...p.getElementsByTagNameNS(W, "fldChar")].find(
      (char) => val(char, "fldCharType") === "begin",
    );
    if (!begin || !isToc(instructionsIn(p))) continue;
    // the paragraphs up to where the field ends, nested fields counted
    let depth = 0;
    let end: Element | null = null;
    const paragraphs: Element[] = [];
    for (let at: Element | null = p; at && !end; at = at.nextElementSibling) {
      if (!isElement(at, "p")) break;
      paragraphs.push(at);
      for (const char of at.getElementsByTagNameNS(W, "fldChar")) {
        const type = val(char, "fldCharType");
        if (type === "begin") depth++;
        if (type === "end" && --depth === 0) {
          end = char;
          break;
        }
      }
    }
    // text around the field isn't the table of contents', and stays as it
    // is, with the entries
    const last = paragraphs[paragraphs.length - 1];
    if (!end || textBeside(p, begin, -1) || textBeside(last, end, 1)) continue;
    const instruction = instructionsIn(p);
    p.before(marker(doc, depthOf(instruction), ""));
    for (const paragraph of paragraphs) paragraph.remove();
    changed = true;
  }
  return changed;
};

/**
 * markTocs rewrites word/document.xml with a marker paragraph for each table
 * of contents
 * @param zip the unpacked .docx file, changed in place
 * @returns whether it had to be rewritten
 */
export const markTocs = async (zip: JSZip) => {
  const xml = await zip.file(DOCUMENT)?.async("string");
  if (xml === undefined || !(/\bTOC\b/.test(xml) || xml.includes(TOC_NAME))) {
    return false;
  }
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) return false;
  const gallery = galleryTocs(doc);
  const fields = fieldTocs(doc);
  if (gallery || fields) {
    zip.file(DOCUMENT, new XMLSerializer().serializeToString(doc));
  }
  return gallery || fields;
};
