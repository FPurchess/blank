import type JSZip from "jszip";

import { SIGNATURE_TAG } from "../../exporters/docx/forms";
import { formatAtom, readAtom } from "../../markdown";
import { SIGNATURE_DEFAULTS } from "../../markdown/blocks/atoms";
import { ATOM_STYLE, child, markerParagraph, val, W } from "./xml";

// Signature blocks from Word, before mammoth, which would keep only their
// text:
// - Blank's own: a content control tagged SIGNATURE_TAG holding the block's
//   marker line as hidden text (src/exporters/docx/index.ts, `signature`);
// - Word's signature lines (Insert > Signature Line): a VML shape with an
//   o:signatureline, which says who is to sign and as what.
// Each becomes a marker paragraph holding a signature block's marker line,
// which styleMap.ts and cleanup.ts (`atoms`) turn into the block. A block
// is never in a table's cell, so those in a table come after it, in the
// order of their cells, and the table stays whole.

const DOCUMENT = "word/document.xml";
// the namespace of VML's Office extensions, where Word's signature lines are
const OFFICE = "urn:schemas-microsoft-com:office:office";

/**
 * hiddenText returns the text of the hidden runs in `element`
 */
const hiddenText = (element: Element) =>
  [...element.getElementsByTagNameNS(W, "r")]
    .filter((run) => child(child(run, "rPr"), "vanish"))
    .map((run) =>
      [...run.getElementsByTagNameNS(W, "t")]
        .map((text) => text.textContent ?? "")
        .join(""),
    )
    .join("")
    .trim();

/**
 * ancestor returns the nearest element named `name` in Word's namespace
 * that holds `element`
 */
const ancestor = (element: Element, name: string) => {
  let current: Element | null = element.parentElement;
  while (current && !(current.namespaceURI === W && current.localName === name))
    current = current.parentElement;
  return current;
};

/**
 * outermostTable returns the table `element` is in, the outermost of
 * nested ones, or null
 */
const outermostTable = (element: Element) => {
  let table: Element | null = null;
  for (let at = ancestor(element, "tbl"); at; at = ancestor(at, "tbl"))
    table = at;
  return table;
};

/**
 * holdsMore tells whether `paragraph` holds text or pictures besides `run`
 */
const holdsMore = (paragraph: Element, run: Element) =>
  [
    ...paragraph.getElementsByTagNameNS(W, "t"),
    ...paragraph.getElementsByTagNameNS(W, "drawing"),
    ...paragraph.getElementsByTagNameNS(W, "pict"),
  ].some(
    (element) =>
      !run.contains(element) &&
      (element.localName !== "t" || !!element.textContent?.trim()),
  );

/**
 * signatureLine returns the marker line of the signature block a Word
 * signature line stands for: its suggested signer and their title
 */
const signatureLine = (line: Element) =>
  formatAtom("signature", {
    ...SIGNATURE_DEFAULTS,
    name: line.getAttributeNS(OFFICE, "suggestedsigner")?.trim() ?? "",
    role: line.getAttributeNS(OFFICE, "suggestedsigner2")?.trim() ?? "",
    extra: {},
  });

/**
 * markSignatures rewrites word/document.xml with a marker paragraph for each
 * signature block and signature line, see the comment on top
 * @param zip the unpacked .docx file, changed in place
 * @returns whether it had to be rewritten
 */
export const markSignatures = async (zip: JSZip) => {
  const xml = await zip.file(DOCUMENT)?.async("string");
  if (
    xml === undefined ||
    !(xml.includes(SIGNATURE_TAG) || xml.includes("signatureline"))
  ) {
    return false;
  }
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) return false;
  // the last marker put after each table, which the next one follows
  const afterTables = new Map<Element, Element>();
  /**
   * place puts the marker of what is at `element` after the table it's in,
   * after the markers already there, and tells whether it did
   */
  const place = (element: Element, marker: Element) => {
    const table = outermostTable(element);
    if (!table) return false;
    (afterTables.get(table) ?? table).after(marker);
    afterTables.set(table, marker);
    return true;
  };
  let changed = false;
  for (const sdt of [...doc.getElementsByTagNameNS(W, "sdt")]) {
    if (val(child(child(sdt, "sdtPr"), "tag")) !== SIGNATURE_TAG) continue;
    const line = hiddenText(sdt);
    // a control whose line was edited away, or holds another block's,
    // stays what it shows
    if (readAtom(line)?.node !== "signature") continue;
    const marker = markerParagraph(doc, ATOM_STYLE, line);
    if (!place(sdt, marker)) sdt.replaceWith(marker);
    // a cell keeps a paragraph, which Word needs in every cell
    else if (sdt.parentElement?.localName === "tc")
      sdt.replaceWith(doc.createElementNS(W, "w:p"));
    else sdt.remove();
    changed = true;
  }
  for (const line of [...doc.getElementsByTagNameNS(OFFICE, "signatureline")]) {
    // the run holding the signature line's picture, and its paragraph
    const run = ancestor(line, "r");
    const paragraph = ancestor(line, "p");
    if (!run || !paragraph?.parentNode) continue;
    const marker = markerParagraph(doc, ATOM_STYLE, signatureLine(line));
    if (place(paragraph, marker)) {
      // the cell keeps its paragraph, with whatever else it holds
      run.remove();
    } else if (holdsMore(paragraph, run)) {
      // the paragraph's other content stays, the block after it
      paragraph.after(marker);
      run.remove();
    } else {
      paragraph.replaceWith(marker);
    }
    changed = true;
  }
  if (changed) zip.file(DOCUMENT, new XMLSerializer().serializeToString(doc));
  return changed;
};
