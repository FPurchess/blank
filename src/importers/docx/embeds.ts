import type JSZip from "jszip";

import {
  DIAGRAMS_NAMESPACE,
  EMBEDS_NAMESPACE,
} from "../../exporters/docx/forms";
import { customParts, markerParagraph, rewriteControls, tagOf } from "./xml";

// Embeds and diagrams from Word: Blank's Word export writes each as a
// picture in a content control tagged with its id, and what makes it again
// in a Custom XML part (see src/exporters/docx/forms.ts): an embed's
// attributes, a diagram's source and settings. Before mammoth, which forgets
// the tags, each such control becomes a marker paragraph holding that as
// JSON, which styleMap.ts and cleanup.ts turn into the figure the schema
// reads it from, checking it as a paste is. A control whose block isn't in
// the part stays its picture.

// the styles of the marker paragraphs, matched by their ids in styleMap.ts
export const EMBED_STYLE = "BlankEmbedMarker";
export const DIAGRAM_STYLE = "BlankDiagramMarker";

/**
 * readPart returns what Blank's Custom XML part `root` of the package
 * holds, by id
 */
const readPart = async (
  zip: JSZip,
  namespace: string,
  root: string,
): Promise<Record<string, unknown>> => {
  const read: Record<string, unknown> = {};
  for (const text of await customParts(zip, namespace, root)) {
    try {
      const part: unknown = JSON.parse(text);
      if (part && typeof part === "object") Object.assign(read, part);
    } catch {
      // not Blank's, or broken: the pictures stay pictures
    }
  }
  return read;
};

/**
 * readEmbeds returns the attributes of the embeds the package holds, by
 * their ids
 */
export const readEmbeds = (zip: JSZip) =>
  readPart(zip, EMBEDS_NAMESPACE, "embeds");

/**
 * readDiagrams returns the sources and settings of the diagrams the package
 * holds, by their ids
 */
export const readDiagrams = (zip: JSZip) =>
  readPart(zip, DIAGRAMS_NAMESPACE, "diagrams");

/**
 * markControls rewrites word/document.xml with a marker paragraph in `style`
 * for each content control of `kind` that `blocks` holds, see the comment
 * on top
 * @param zip the unpacked .docx file, changed in place
 * @param blocks what makes each block again, by its id
 * @returns whether it had to be rewritten
 */
const markControls = (
  zip: JSZip,
  kind: "embed" | "diagram",
  blocks: Record<string, unknown>,
  style: string,
) => {
  if (Object.keys(blocks).length === 0) return Promise.resolve(false);
  return rewriteControls(zip, (sdt, doc) => {
    const tag = tagOf(sdt) as Record<string, unknown> | null;
    const id = tag?.[kind];
    if (typeof id !== "string" || !Object.hasOwn(blocks, id)) return false;
    sdt.replaceWith(markerParagraph(doc, style, JSON.stringify(blocks[id])));
    return true;
  });
};

/**
 * markEmbeds marks the embeds of Blank's, see markControls
 */
export const markEmbeds = (zip: JSZip, embeds: Record<string, unknown>) =>
  markControls(zip, "embed", embeds, EMBED_STYLE);

/**
 * markDiagrams marks the diagrams of Blank's, see markControls
 */
export const markDiagrams = (zip: JSZip, diagrams: Record<string, unknown>) =>
  markControls(zip, "diagram", diagrams, DIAGRAM_STYLE);
