import JSZip from "jszip";

// Fixes to the package docx 9.7.2 writes, applied to the zipped document.

const COMMENTS = "word/comments.xml";
const STYLES = "word/styles.xml";

const read = (zip: JSZip, name: string) => zip.file(name)?.async("string");

const rewrite = async (
  zip: JSZip,
  name: string,
  change: (xml: string) => string,
) => {
  const xml = await read(zip, name);
  if (xml !== undefined) zip.file(name, change(xml));
};

/**
 * stripEmptyComments removes the empty comments part docx writes into every
 * document. Google Drive refuses to preview a document with it
 * (https://github.com/dolanmiu/docx/issues/3506, fixed after 9.7.2).
 */
const stripEmptyComments = async (zip: JSZip) => {
  const comments = await read(zip, COMMENTS);
  if (comments === undefined || /<w:comment\b/.test(comments)) return;

  zip.remove(COMMENTS);
  zip.remove("word/_rels/comments.xml.rels");
  await rewrite(zip, "word/_rels/document.xml.rels", (xml) =>
    xml.replace(/<Relationship\b[^>]*Target="comments\.xml"[^>]*\/>/g, ""),
  );
  await rewrite(zip, "[Content_Types].xml", (xml) =>
    xml.replace(
      /<Override\b[^>]*PartName="\/word\/comments\.xml"[^>]*\/>/g,
      "",
    ),
  );
};

/**
 * markNormalAsDefault makes the Normal style the default paragraph style.
 * docx can't set the flag, and pandoc misses headings (among others) when
 * no paragraph style is the default.
 */
const markNormalAsDefault = (zip: JSZip) =>
  rewrite(zip, STYLES, (xml) =>
    xml.replace(
      /<w:style w:type="paragraph" w:styleId="Normal">/,
      '<w:style w:type="paragraph" w:default="1" w:styleId="Normal">',
    ),
  );

/**
 * fixPackage applies the fixes to a .docx file written by docx
 * @param contents the .docx file
 * @returns the fixed .docx file
 */
export const fixPackage = async (contents: Uint8Array) => {
  const zip = await JSZip.loadAsync(contents);
  await stripEmptyComments(zip);
  await markNormalAsDefault(zip);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
};
