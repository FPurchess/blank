import type JSZip from "jszip";

import { parseWidth } from "../../markdown/blocks/caps";
import { DOCUMENT_PART, parsePart } from "./xml";

// The widths of pictures from Word: Blank's Word export names a picture
// given a width (a share of the text's, or a length) after it, as
// `image-3 blank-width=50%25` (`pictureName` in
// src/exporters/docx/properties.ts). mammoth reads no picture's size
// or name, so before it, each picture named so gets the width as a mark
// after its description, which `pictureOf` (in ./index.ts) takes off again
// as the image's width. Pictures of other apps keep their own size, so a
// picture that merely fills the text's width stays a markdown image.

// DrawingML's drawings in the text, and its picture properties
const WP =
  "http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing";

// what a description's width mark starts with: an invisible separator,
// which no description has
const MARK = "\u2063width=";

// how the export names a picture's width (see pictureName)
const NAMED = /\sblank-width=(\S+)$/;

/**
 * widthNamed returns the width a picture's name gives, if it is one Blank
 * can lay out
 */
const widthNamed = (name: string) => {
  const found = NAMED.exec(name)?.[1];
  if (!found) return null;
  try {
    const width = decodeURIComponent(found);
    return parseWidth(width) ? width : null;
  } catch {
    return null;
  }
};

/**
 * markPictureWidths marks the pictures of word/document.xml that Blank's
 * export named with a width, see the comment on top
 * @param zip the unpacked .docx file, changed in place
 * @returns whether it had to be rewritten
 */
export const markPictureWidths = async (zip: JSZip) => {
  const doc = await parsePart(zip, DOCUMENT_PART);
  if (!doc) return false;
  let changed = false;
  for (const properties of [...doc.getElementsByTagNameNS(WP, "docPr")]) {
    const width = widthNamed(properties.getAttribute("name") ?? "");
    if (!width) continue;
    const description = properties.getAttribute("descr") ?? "";
    properties.setAttribute("descr", `${description}${MARK}${width}`);
    changed = true;
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
