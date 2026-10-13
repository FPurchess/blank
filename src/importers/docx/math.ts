import type JSZip from "jszip";

import {
  M,
  MATH_NAMESPACE,
  type StoredMath,
  structural,
} from "../../exporters/docx/math";
import { fnv1a } from "../../sources/hash";
import { freeEquationIdIn } from "../../math/labels";
import { ommlToLatex } from "./omml";
import {
  child,
  customParts,
  DOCUMENT_PART,
  markerParagraph,
  markerRun,
  parsePart,
  val,
  W,
} from "./xml";

/*
 * Word's equations, which mammoth drops: before mammoth reads the document,
 * each becomes a marker holding its LaTeX, a paragraph for display math and
 * a run for inline math, which styleMap.ts and cleanup.ts turn into Blank's
 * math. An equation Blank exported gets its LaTeX back as it was, as long as
 * it wasn't changed in Word (its hash, see ../../exporters/docx/math.ts);
 * any other is read from its OMML (./omml.ts).
 */

export const MATH_PARA_STYLE = "BlankMathPara";
export const MATH_RUN_STYLE = "BlankMathRun";

// what a marker holds, as JSON
export interface MathMarker {
  latex: string;
  label?: string | null;
  align?: string | null;
}

const isMath = (node: Element, name: string) =>
  node.namespaceURI === M && node.localName === name;

/**
 * displayParagraph tells whether the paragraph `p` holds only the equation
 * `math` and what numbers it: tabs, parentheses and a SEQ field, as Blank
 * writes a numbered equation. Returns whether it is numbered, or null for a
 * paragraph with other text.
 */
const displayParagraph = (p: Element, math: Element): boolean | null => {
  // only a SEQ field makes the digits and parentheses its number: without
  // one, they are the paragraph's text, like a number typed by hand
  const numbered = hasSequence(p);
  for (const node of [...p.children]) {
    if (
      node === math ||
      node.localName === "pPr" ||
      node.localName === "bookmarkStart" ||
      node.localName === "bookmarkEnd"
    )
      continue;
    if (node.namespaceURI === W && node.localName === "fldSimple") {
      if (SEQ.test(val(node, "instr") ?? "")) continue;
      return null;
    }
    if (node.namespaceURI === W && node.localName === "r") {
      const text = [...node.getElementsByTagNameNS(W, "t")]
        .map((t) => t.textContent ?? "")
        .join("");
      if ((numbered ? /^[\s()0-9.]*$/ : /^\s*$/).test(text)) continue;
      return null;
    }
    return null;
  }
  return numbered;
};

const SEQ = /^\s*SEQ\b/;

/**
 * hasSequence tells whether the paragraph `p` has a SEQ field, simple or
 * complex: the number of a numbered equation
 */
const hasSequence = (p: Element) =>
  [...p.children].some((node) => {
    if (node.namespaceURI !== W) return false;
    if (node.localName === "fldSimple")
      return SEQ.test(val(node, "instr") ?? "");
    if (node.localName !== "r") return false;
    return [...node.getElementsByTagNameNS(W, "instrText")].some((text) =>
      SEQ.test(text.textContent ?? ""),
    );
  });

/**
 * storedMath returns the formulas Blank stored with the document, by the
 * hash of their equations: a formula is found by its equation, wherever
 * Word put it and whatever was added before it
 */
const storedMath = async (zip: JSZip) => {
  const byHash = new Map<string, StoredMath[]>();
  for (const text of await customParts(zip, MATH_NAMESPACE, "math")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      // not Blank's, or broken: the equations are read from their OMML
      continue;
    }
    if (!Array.isArray(parsed)) continue;
    for (const entry of parsed as Partial<StoredMath>[]) {
      if (typeof entry?.hash !== "string" || typeof entry.latex !== "string")
        continue;
      const same = byHash.get(entry.hash) ?? [];
      same.push(entry as StoredMath);
      byHash.set(entry.hash, same);
    }
  }
  return byHash;
};

/**
 * markMath turns the equations of the document into markers
 * @returns how many equations it read only in part, as their text, or null
 *   if there was no equation
 */
export const markMath = async (zip: JSZip): Promise<number | null> => {
  const doc = await parsePart(zip, DOCUMENT_PART);
  if (!doc) return null;
  const found = [...doc.getElementsByTagNameNS(M, "*")].filter(
    (node) =>
      (isMath(node, "oMathPara") || isMath(node, "oMath")) &&
      !(node.parentElement && isMath(node.parentElement, "oMathPara")),
  );
  if (!found.length) return null;
  const stored = await storedMath(zip);
  let approximate = 0;
  const equations = found.map((math) => {
    // the first of the same equation not taken yet
    const kept = stored.get(fnv1a(structural(math)))?.shift() ?? null;
    let latex: string;
    if (kept) latex = kept.latex;
    else {
      const read = ommlToLatex(math);
      latex = read.latex;
      if (read.unknown.length) approximate++;
    }
    const p = math.parentElement;
    const inParagraph = p?.namespaceURI === W && p.localName === "p";
    const numbered = inParagraph ? displayParagraph(p, math) : null;
    return { math, kept, latex, p: inParagraph ? p : null, numbered };
  });
  // the ids of the equations Blank wrote come first: one made in Word
  // before them mustn't take theirs
  const taken = new Set(
    equations.flatMap(({ kept, numbered }) =>
      numbered && kept?.label ? [kept.label] : [],
    ),
  );
  const used = new Set<string>();
  for (const { math, kept, latex, p, numbered } of equations) {
    const display = isMath(math, "oMathPara") || numbered !== null;
    if (display && p && numbered !== null) {
      const label = numbered
        ? kept?.label && !used.has(kept.label)
          ? kept.label
          : freeEquationIdIn(taken)
        : null;
      if (label) {
        taken.add(label);
        used.add(label);
      }
      const jc = val(child(child(p, "pPr"), "jc"));
      const align =
        jc === "left" || jc === "start"
          ? "left"
          : jc === "right" || jc === "end"
            ? "right"
            : null;
      const marker: MathMarker = { latex, label, align };
      p.replaceWith(
        markerParagraph(doc, MATH_PARA_STYLE, JSON.stringify(marker)),
      );
      continue;
    }
    // within text: inline math, also an m:oMathPara Word put in a line
    math.replaceWith(markerRun(doc, MATH_RUN_STYLE, JSON.stringify({ latex })));
  }
  zip.file(DOCUMENT_PART, new XMLSerializer().serializeToString(doc));
  return approximate;
};
