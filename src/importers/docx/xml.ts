import type JSZip from "jszip";

// Reading the XML parts of a .docx.

// WordprocessingML, the namespace of document.xml, styles.xml and the others
export const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

// the parts of a .docx that more than one reader reads
export const DOCUMENT_PART = "word/document.xml";
export const SETTINGS_PART = "word/settings.xml";

/**
 * parsePart parses an XML part of the package
 * @returns the part, or null if it is missing or broken
 */
export const parsePart = async (zip: JSZip, name: string) => {
  const xml = await zip.file(name)?.async("string");
  if (xml === undefined) return null;
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  return doc.getElementsByTagName("parsererror").length ? null : doc;
};

/**
 * children returns the child elements of `parent` with the WordprocessingML
 * name `name`
 */
export const children = (parent: Element, name: string) =>
  [...parent.children].filter(
    (child) => child.namespaceURI === W && child.localName === name,
  );

/**
 * child returns the first child element of `parent` named `name`
 */
export const child = (parent: Element | undefined, name: string) =>
  parent ? children(parent, name)[0] : undefined;

/**
 * val returns the WordprocessingML attribute `name` of `element`
 */
export const val = (element: Element | undefined, name = "val") =>
  element?.getAttributeNS(W, name) ?? null;

/**
 * isOn checks a switch like <w:pageBreakBefore/>, which w:val="0" turns off
 */
export const isOn = (element: Element | undefined) =>
  element !== undefined && !["0", "false", "off"].includes(val(element) ?? "");

/**
 * markerParagraph returns a paragraph in the style `style`, holding `text`:
 * what the rewrites before mammoth mark what it would lose with, for
 * styleMap.ts and cleanup.ts to turn back into Blank's blocks
 */
export const markerParagraph = (
  doc: Document,
  style: string,
  text?: string,
) => {
  const p = doc.createElementNS(W, "w:p");
  const pPr = p.appendChild(doc.createElementNS(W, "w:pPr"));
  const pStyle = pPr.appendChild(doc.createElementNS(W, "w:pStyle"));
  pStyle.setAttributeNS(W, "w:val", style);
  if (text !== undefined) {
    const r = p.appendChild(doc.createElementNS(W, "w:r"));
    r.appendChild(doc.createElementNS(W, "w:t")).textContent = text;
  }
  return p;
};

/**
 * customParts returns the text of each Custom XML part of the package whose
 * root is `root` in `namespace`, e.g. what Blank's Word export keeps there
 */
export const customParts = async (
  zip: JSZip,
  namespace: string,
  root: string,
): Promise<string[]> => {
  const texts: string[] = [];
  for (const name of Object.keys(zip.files)) {
    if (!/^customXml\/item\d+\.xml$/.test(name)) continue;
    const element = (await parsePart(zip, name))?.documentElement;
    if (element?.namespaceURI === namespace && element.localName === root) {
      texts.push(element.textContent ?? "");
    }
  }
  return texts;
};
