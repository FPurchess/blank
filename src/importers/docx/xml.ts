import type JSZip from "jszip";

// Reading the XML parts of a .docx.

// WordprocessingML, the namespace of document.xml, styles.xml and the others
export const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";

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
