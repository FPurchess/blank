import type JSZip from "jszip";

import { child, DOCUMENT_PART, parsePart, val, W } from "./xml";

// The widths of pictures from Word: Blank's Word export writes a picture
// given a share of the text's width (src/markdown/blocks/caps.ts) at that
// share. mammoth reads no picture's size, so before it, each picture whose
// width is 50, 75 or 100 % of the text's, within a hair, gets the share as a
// mark after its description, which `pictureOf` (in ./index.ts) takes off
// again as the image's width. Pictures in table cells, whose room is the
// cell's, keep their own size.

// DrawingML's drawings in the text, and its picture properties
const WP =
  "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";

// what a description's width mark starts with: an invisible separator,
// which no description has
const MARK = "⁣width=";

// the shares a picture can be given, and how close its width must be
const SHARES = [0.5, 0.75, 1];
const TOLERANCE = 0.02;

// EMUs, in which pictures are sized, per twip, in which pages are
const EMU_PER_TWIP = 635;

/**
 * textWidth returns the width of the text of the document's last section,
 * in twips, if it says
 */
const textWidth = (doc: Document) => {
  const sections = [...doc.getElementsByTagNameNS(W, "sectPr")];
  const last = sections[sections.length - 1];
  const width = Number(val(child(last, "pgSz"), "w"));
  const margin = (side: string) =>
    Math.abs(Number(val(child(last, "pgMar"), side)) || 0);
  const text = width - margin("left") - margin("right");
  return width > 0 && text > 0 ? text : null;
};

/**
 * shareOf returns the share of the text's width `cx` is, if it is one of
 * SHARES
 */
const shareOf = (cx: number, room: number) =>
  SHARES.find((share) => Math.abs(cx / room - share) <= TOLERANCE);

/**
 * markPictureWidths marks the pictures of word/document.xml that take a
 * share of the text's width, see the comment on top
 * @param zip the unpacked .docx file, changed in place
 * @returns whether it had to be rewritten
 */
export const markPictureWidths = async (zip: JSZip) => {
  const doc = await parsePart(zip, DOCUMENT_PART);
  const text = doc && textWidth(doc);
  if (!doc || !text) return false;
  const room = text * EMU_PER_TWIP;
  let changed = false;
  for (const name of ["inline", "anchor"]) {
    for (const drawing of [...doc.getElementsByTagNameNS(WP, name)]) {
      if (drawing.closest("tc")) continue;
      const extent = drawing.getElementsByTagNameNS(WP, "extent")[0];
      const properties = drawing.getElementsByTagNameNS(WP, "docPr")[0];
      const share = extent && shareOf(Number(extent.getAttribute("cx")), room);
      if (!share || !properties) continue;
      const description = properties.getAttribute("descr") ?? "";
      properties.setAttribute("descr", `${description}${MARK}${share * 100}%`);
      changed = true;
    }
  }
  if (changed) {
    zip.file(DOCUMENT_PART, new XMLSerializer().serializeToString(doc));
  }
  return changed;
};

/**
 * pictureOf returns a picture's description without its width mark, and
 * the width it marks
 */
export const pictureOf = (description: string | undefined) => {
  const [alt, width] = (description ?? "").split(MARK);
  return { alt, width: width ?? null };
};
