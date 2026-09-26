import JSZip from "jszip";

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const NUMBERING = "word/numbering.xml";

const children = (parent: Element, name: string) =>
  [...parent.children].filter(
    (child) => child.namespaceURI === W && child.localName === name,
  );

const val = (element: Element | undefined, name = "val") =>
  element?.getAttributeNS(W, name) ?? null;

/**
 * inlineLevelOverrides moves the list levels a numbering overrides into a
 * copy of the list definition it is based on. mammoth only reads the list
 * definitions, so it would take e.g. a numbered list LibreOffice nests into a
 * bullet list for another bullet list.
 * @param xml word/numbering.xml
 * @returns the numbering without level overrides, or null if it has none
 */
export const inlineLevelOverrides = (xml: string): string | null => {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  const root = doc.documentElement;
  const definitions = new Map(
    children(root, "abstractNum").map((definition) => [
      val(definition, "abstractNumId"),
      definition,
    ]),
  );
  let nextId =
    Math.max(-1, ...[...definitions.keys()].map((id) => Number(id) || 0)) + 1;
  let changed = false;

  for (const num of children(root, "num")) {
    const levels = children(num, "lvlOverride").flatMap((override) =>
      children(override, "lvl"),
    );
    const reference = children(num, "abstractNumId")[0];
    const definition = definitions.get(val(reference));
    if (levels.length === 0 || !reference || !definition) continue;

    const copy = definition.cloneNode(true) as Element;
    const id = String(nextId++);
    copy.setAttributeNS(W, "w:abstractNumId", id);
    for (const level of levels) {
      const ilvl = val(level, "ilvl");
      const replaced = children(copy, "lvl").find(
        (existing) => val(existing, "ilvl") === ilvl,
      );
      if (replaced) replaced.replaceWith(level);
      else copy.appendChild(level);
    }
    // the definitions come before the numberings
    root.insertBefore(copy, children(root, "num")[0]);
    reference.setAttributeNS(W, "w:val", id);
    changed = true;
  }

  return changed ? new XMLSerializer().serializeToString(doc) : null;
};

/**
 * normalizeNumbering rewrites the numbering of a .docx for mammoth, see
 * inlineLevelOverrides
 * @param bytes the .docx file
 * @returns the .docx file, rewritten if it had to be
 */
export const normalizeNumbering = async (bytes: Uint8Array) => {
  const zip = await JSZip.loadAsync(bytes);
  const xml = await zip.file(NUMBERING)?.async("string");
  const normalized = xml === undefined ? null : inlineLevelOverrides(xml);
  if (normalized === null) return bytes;
  zip.file(NUMBERING, normalized);
  return zip.generateAsync({ type: "uint8array" });
};
