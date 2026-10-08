import type JSZip from "jszip";

import { SIGNATURE_TAG } from "../../exporters/docx/forms";
import { formatAtom, readAtom } from "../../markdown";
import { SIGNATURE_DEFAULTS } from "../../markdown/blocks/atoms";
import { ATOM_STYLE } from "./toc";
import { child, markerParagraph, val, W } from "./xml";

// Signature blocks from Word, before mammoth, which would keep only their
// text:
// - Blank's own: a content control tagged SIGNATURE_TAG holding the block's
//   marker line as hidden text (src/exporters/docx/index.ts, `signature`);
// - Word's signature lines (Insert > Signature Line): a VML shape with an
//   o:signatureline, which says who is to sign and as what.
// Each becomes a marker paragraph holding a signature block's marker line,
// which styleMap.ts and cleanup.ts (`atoms`) turn into the block.

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
  let changed = false;
  for (const sdt of [...doc.getElementsByTagNameNS(W, "sdt")]) {
    if (val(child(child(sdt, "sdtPr"), "tag")) !== SIGNATURE_TAG) continue;
    const line = hiddenText(sdt);
    // a control whose line was edited away stays what it shows
    if (!readAtom(line)) continue;
    sdt.replaceWith(markerParagraph(doc, ATOM_STYLE, line));
    changed = true;
  }
  for (const line of [...doc.getElementsByTagNameNS(OFFICE, "signatureline")]) {
    // the paragraph the signature line's picture stands in
    let paragraph: Element | null = line;
    while (
      paragraph &&
      !(paragraph.namespaceURI === W && paragraph.localName === "p")
    ) {
      paragraph = paragraph.parentElement;
    }
    if (!paragraph?.parentNode) continue;
    paragraph.replaceWith(
      markerParagraph(doc, ATOM_STYLE, signatureLine(line)),
    );
    changed = true;
  }
  if (changed) zip.file(DOCUMENT, new XMLSerializer().serializeToString(doc));
  return changed;
};
