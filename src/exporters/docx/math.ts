import type JSZip from "jszip";

import { M, toOmml } from "../../math/omml";
import { fnv1a } from "../../sources/hash";
import { addCustomPart, CUSTOM_PARTS } from "./forms";

export { M } from "../../math/omml";
export { MATH_NAMESPACE } from "./forms";

/*
 * Math in the Word export: Word's own equations (OMML), which Word and
 * LibreOffice edit as equations. The exporter writes a placeholder run for
 * each formula (`MATH_PLACEHOLDER`, holding its number), and `addMath`
 * replaces them with the equations once the package is written, since docx
 * can't take OMML as it is. The LaTeX of each goes into a Custom XML part,
 * with a hash of its equation, so the Word import gets the LaTeX back as it
 * was while the equation is unchanged (src/importers/docx/math.ts).
 */

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const DOCUMENT = "word/document.xml";

// the style of a formula's placeholder run, which never stays in the file
export const MATH_PLACEHOLDER = "BlankMath";

export interface MathEntry {
  latex: string;
  // display math, on a paragraph of its own
  display: boolean;
  // the id of a numbered equation
  label: string | null;
  // set between tab stops with its number after it: an m:oMath, not an
  // m:oMathPara
  numbered: boolean;
}

// a formula with its equation, null for one that can't be converted
export type ConvertedMath = MathEntry & { omml: string | null };

/**
 * convertMath makes the equations of the formulas
 */
export const convertMath = (
  entries: readonly MathEntry[],
): Promise<ConvertedMath[]> =>
  Promise.all(
    entries.map(async (entry) => ({
      ...entry,
      omml: await toOmml(entry.latex, entry.display),
    })),
  );

// what the Custom XML part holds of each formula, in the order of the
// document
export interface StoredMath {
  latex: string;
  display: boolean;
  label: string | null;
  hash: string;
}

/**
 * structural returns what an equation is made of, for comparing: its math
 * elements and their text, without their properties, which Word and
 * LibreOffice write as they like when they save a file again. What isn't
 * math, like Word's bookmarks and proofing marks, is left out, and the text
 * of runs next to each other is one, without spaces: Word splits and joins
 * runs as it likes, and ignores spaces in math.
 */
export const structural = (element: Element): string => {
  const parts: string[] = [];
  let text = "";
  const flush = () => {
    if (text) parts.push(`"${text}"`);
    text = "";
  };
  const walk = (node: Element) => {
    if (node.namespaceURI !== M) return;
    const name = node.localName;
    if (name.endsWith("Pr")) return;
    if (name === "r") {
      for (const child of node.children) {
        if (child.namespaceURI === M && child.localName === "t")
          text += (child.textContent ?? "").replace(/\s+/g, "");
      }
      return;
    }
    flush();
    parts.push(`<${name}>`);
    for (const child of node.children) walk(child);
    flush();
    parts.push(`</${name}>`);
  };
  walk(element);
  flush();
  return parts.join("");
};

/**
 * linear returns a formula Word can't get as an equation as one run of its
 * LaTeX, which Word converts to an equation on Alt+= and Convert
 */
const linear = (latex: string) =>
  `<m:oMath xmlns:m="${M}"><m:r><m:t xml:space="preserve">${escape(latex)}</m:t></m:r></m:oMath>`;

const escape = (text: string) =>
  text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

const parse = (xml: string) => {
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  return doc.getElementsByTagName("parsererror").length
    ? null
    : doc.documentElement;
};

/**
 * equationOf returns the equation of a formula, or its LaTeX as text if it
 * has none or it doesn't parse: a parser's error must never go into the
 * document
 */
const equationOf = (entry: ConvertedMath): Element =>
  (entry.omml !== null && parse(entry.omml)) || parse(linear(entry.latex))!;

// a placeholder run as docx writes it, with the number of its formula
const PLACEHOLDER_RUN = new RegExp(
  `<w:r>(?:(?!</w:r>).)*?<w:rStyle w:val="${MATH_PLACEHOLDER}"/>(?:(?!</w:r>).)*?<w:t[^>]*>(\\d+)</w:t></w:r>`,
  "gs",
);

/**
 * withLatex replaces the placeholder runs of a document it can't parse
 * with the LaTeX of their formulas as text, so no number in a style Word
 * hasn't is left in the file
 */
const withLatex = (xml: string, entries: readonly ConvertedMath[]) =>
  xml.replace(PLACEHOLDER_RUN, (_, index: string) => {
    const latex = entries[Number(index)]?.latex;
    return latex === undefined
      ? ""
      : `<w:r><w:t xml:space="preserve">${escape(latex)}</w:t></w:r>`;
  });

/**
 * addMath replaces the placeholder runs of the package's document with the
 * formulas' equations, or their LaTeX as text where there is none, and
 * stores their LaTeX
 */
export const addMath = async (
  zip: JSZip,
  entries: readonly ConvertedMath[],
) => {
  if (!entries.length) return;
  const xml = await zip.file(DOCUMENT)?.async("string");
  if (xml === undefined) return;
  const doc = new DOMParser().parseFromString(xml, "application/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    zip.file(DOCUMENT, withLatex(xml, entries));
    return;
  }
  const stored: StoredMath[] = entries.map((entry) => ({
    latex: entry.latex,
    display: entry.display,
    label: entry.label,
    hash: "",
  }));
  for (const run of [...doc.getElementsByTagNameNS(W, "r")]) {
    const style = run
      .getElementsByTagNameNS(W, "rStyle")[0]
      ?.getAttributeNS(W, "val");
    if (style !== MATH_PLACEHOLDER) continue;
    const index = Number(run.textContent);
    const entry = entries[index];
    if (!entry) {
      run.remove();
      continue;
    }
    let math = doc.importNode(equationOf(entry), true) as Element;
    if (entry.display && !entry.numbered) {
      const paragraph = doc.createElementNS(M, "m:oMathPara");
      paragraph.append(math);
      math = paragraph;
    }
    // of all of it, as the import compares it: a line Word added to an
    // m:oMathPara changes it
    stored[index].hash = fnv1a(structural(math));
    run.replaceWith(math);
  }
  zip.file(DOCUMENT, new XMLSerializer().serializeToString(doc));
  await addCustomPart(zip, CUSTOM_PARTS.math, JSON.stringify(stored));
};
