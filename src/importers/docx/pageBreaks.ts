import type JSZip from "jszip";

import {
  child,
  DOCUMENT_PART,
  isOn,
  markerParagraph,
  parsePart,
  val,
  W,
} from "./xml";

// mammoth drops page breaks, so they are turned into marker paragraphs
// before the conversion, which styleMap.ts and cleanup.ts turn into Blank's
// page breaks. Word starts a new page at:
// - a page break inside a paragraph, <w:br w:type="page"/>
// - a paragraph with its own "Page break before", <w:pageBreakBefore/>
// - the end of a section that starts the next one on a new page

// the style of the marker paragraphs, matched by its id in styleMap.ts
export const PAGE_BREAK_STYLE = "BlankPageBreak";

const marker = (doc: Document) => markerParagraph(doc, PAGE_BREAK_STYLE);

const isPageBreak = (element: Element) =>
  element.namespaceURI === W &&
  element.localName === "br" &&
  val(element, "type") === "page";

// what shows in a paragraph: text, tabs, line breaks, pictures
const hasContent = (element: Element) =>
  (element.textContent ?? "").trim() !== "" ||
  ["tab", "drawing", "pict", "object"].some(
    (name) => element.getElementsByTagNameNS(W, name).length > 0,
  ) ||
  [...element.getElementsByTagNameNS(W, "br")].some((br) => !isPageBreak(br));

// stands for a page break among the pieces of a split element
const BREAK = Symbol("page break");
type Piece = Node | typeof BREAK;

// what holds paragraphs of its own, whose page breaks aren't its parent's
const BOXES = ["p", "tbl", "txbxContent"];

/**
 * hasPageBreak checks whether `element` holds a page break of its own, not
 * one in a paragraph of a text box or table inside it
 */
const hasPageBreak = (element: Element) =>
  [...element.getElementsByTagNameNS(W, "br")].some((br) => {
    if (!isPageBreak(br)) return false;
    for (
      let parent = br.parentElement;
      parent && parent !== element;
      parent = parent.parentElement
    ) {
      if (BOXES.includes(parent.localName)) return false;
    }
    return true;
  });

// the properties of an element, like w:pPr or w:rPr, which each piece keeps
const isProperties = (node: Node) =>
  node.nodeType === Node.ELEMENT_NODE &&
  (node as Element).localName.endsWith("Pr");

/**
 * split splits an element at the page breaks inside it, at any depth: a
 * paragraph, a run, a link or a tracked insertion. Each piece is a copy of
 * the element with its properties, so text keeps its formatting.
 */
const split = (node: Node): Piece[] => {
  const element = node as Element;
  if (node.nodeType !== Node.ELEMENT_NODE) return [node.cloneNode(true)];
  if (isPageBreak(element)) return [BREAK];
  if (!hasPageBreak(element)) return [node.cloneNode(true)];

  const properties = [...element.childNodes].filter(isProperties);
  const pieces: Piece[] = [];
  let current: Element | undefined;
  const piece = () => {
    if (!current) {
      current = element.cloneNode(false) as Element;
      properties.forEach((p) => current!.appendChild(p.cloneNode(true)));
    }
    return current;
  };
  for (const childNode of element.childNodes) {
    if (properties.includes(childNode)) continue;
    for (const inner of split(childNode)) {
      if (inner === BREAK) {
        if (current) pieces.push(current);
        current = undefined;
        pieces.push(BREAK);
      } else {
        piece().appendChild(inner);
      }
    }
  }
  if (current) pieces.push(current);
  return pieces;
};

/**
 * splitAtBreaks splits a paragraph at its page breaks into the paragraphs
 * between them, with a marker for each break. Parts without content are left
 * out, e.g. before a break at the start.
 */
const splitAtBreaks = (p: Element) =>
  split(p).flatMap((piece) => {
    if (piece === BREAK) return [marker(p.ownerDocument)];
    return hasContent(piece as Element) ? [piece] : [];
  });

// a page break in a table cell or text box, which can't hold one in Blank,
// is left to mammoth, which drops it
const inBox = (element: Element) => {
  for (
    let parent = element.parentElement;
    parent;
    parent = parent.parentElement
  ) {
    if (BOXES.includes(parent.localName)) return true;
  }
  return false;
};

// a section that doesn't start the next one on the same page
const startsNewPage = (sectPr: Element | undefined) =>
  sectPr !== undefined && val(child(sectPr, "type")) !== "continuous";

/**
 * markPageBreaks rewrites word/document.xml with a marker paragraph wherever
 * a new page starts
 * @param zip the unpacked .docx file, changed in place
 * @returns whether it had to be rewritten
 */
export const markPageBreaks = async (zip: JSZip) => {
  const doc = await parsePart(zip, DOCUMENT_PART);
  if (!doc) return false;

  let changed = false;
  for (const p of [...doc.getElementsByTagNameNS(W, "p")]) {
    if (inBox(p)) continue;
    const pPr = child(p, "pPr");
    if (isOn(child(pPr, "pageBreakBefore"))) {
      p.before(marker(doc));
      changed = true;
    }
    // the section properties stay with the first part, as Word keeps them
    // on the paragraph that ends the section
    if (startsNewPage(child(pPr, "sectPr")) && p.nextElementSibling) {
      p.after(marker(doc));
      changed = true;
    }
    if (hasPageBreak(p)) {
      p.replaceWith(...splitAtBreaks(p));
      changed = true;
    }
  }
  if (changed)
    zip.file(DOCUMENT_PART, new XMLSerializer().serializeToString(doc));
  return changed;
};
