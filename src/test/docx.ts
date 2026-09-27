import JSZip from "jszip";

// Helpers for tests of the Word import and export.

/**
 * rewriteDocx changes one part of a .docx, like a Word user editing the
 * document would
 * @param bytes the .docx file
 * @param name the part, e.g. "docProps/core.xml"
 * @param change gets the part's XML, or undefined if it is missing
 * @returns the changed .docx file
 */
export const rewriteDocx = async (
  bytes: Uint8Array,
  name: string,
  change: (xml: string | undefined) => string,
) => {
  const zip = await JSZip.loadAsync(bytes);
  zip.file(name, change(await zip.file(name)?.async("string")));
  return zip.generateAsync({ type: "uint8array" });
};
