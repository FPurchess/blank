import type JSZip from "jszip";

import { EMBEDS_NAMESPACE, readTag } from "../../exporters/docx/forms";
import { child, children, customParts, markerParagraph, val, W } from "./xml";

// Embeds from Word: Blank's Word export writes an embed as a picture of its
// drawing in a content control tagged with its id, and its attributes in a
// Custom XML part (see src/exporters/docx/forms.ts). Before mammoth, which
// forgets the tags, each such control becomes a marker paragraph holding
// the embed's attributes as JSON, which styleMap.ts and cleanup.ts turn into
// the figure the schema reads an embed from, checking it as a paste is. A
// control whose embed isn't in the part stays its picture.

const DOCUMENT = "word/document.xml";

// the style of the marker paragraphs, matched by its id in styleMap.ts
export const EMBED_STYLE = "BlankEmbedMarker";

/**
 * readEmbeds returns the attributes of the embeds the package holds, by
 * their ids
 */
export const readEmbeds = async (
  zip: JSZip,
): Promise<Record<string, unknown>> => {
  const embeds: Record<string, unknown> = {};
  for (const text of await customParts(zip, EMBEDS_NAMESPACE, "embeds")) {
    try {
      const read: unknown = JSON.parse(text);
      if (read && typeof read === "object") Object.assign(embeds, read);
    } catch {
      // not Blank's, or broken: the pictures stay pictures
    }
  }
  return embeds;
};

/**
 * markEmbeds rewrites word/document.xml with a marker paragraph for each
 * embed of Blank's, see the comment on top
 * @param zip the unpacked .docx file, changed in place
 * @param embeds the attributes of the embeds, by their ids
 * @returns whether it had to be rewritten
 */
export const markEmbeds = async (
  zip: JSZip,
  embeds: Record<string, unknown>,
) => {
  const xml = await zip.file(DOCUMENT)?.async("string");
  if (xml === undefined || Object.keys(embeds).length === 0) return false;
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) return false;
  const body = doc.getElementsByTagNameNS(W, "body")[0];
  let changed = false;
  for (const sdt of children(body, "sdt")) {
    const tag = readTag(val(child(child(sdt, "sdtPr"), "tag")));
    if (!tag || !("embed" in tag) || !Object.hasOwn(embeds, tag.embed)) {
      continue;
    }
    sdt.replaceWith(
      markerParagraph(doc, EMBED_STYLE, JSON.stringify(embeds[tag.embed])),
    );
    changed = true;
  }
  if (changed) zip.file(DOCUMENT, new XMLSerializer().serializeToString(doc));
  return changed;
};
