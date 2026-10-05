import type JSZip from "jszip";

import { EMBED_STYLE } from "./embeds";
import { FORM_STYLE } from "./forms";
import { PAGE_BREAK_STYLE } from "./pageBreaks";
import { TOC_STYLE } from "./toc";
import { child, children, DOCUMENT_PART, parsePart, val, W } from "./xml";

// mammoth reads a paragraph's alignment (w:jc) but writes it nowhere in its
// HTML, and never reads the alignment its style gives it. So before the
// conversion each aligned paragraph gets a marker run first, in a character
// style styleMap.ts turns into a span with a class, which cleanup.ts turns
// into the paragraph's alignment and removes, with its text. The run needs
// text, or mammoth would drop it; the text is an invisible separator, which
// cleanup.ts also removes wherever it is left.

// the alignments a marker run carries: left counts in table cells only, as
// markdown aligns a column
export const WORD_ALIGNMENTS = ["left", "center", "right", "justify"] as const;

export type WordAlignment = (typeof WORD_ALIGNMENTS)[number];

// the text of the marker runs, the invisible separator
export const ALIGN_MARKER = "\u2063";

// the character style of a marker run, matched by its id in styleMap.ts
export const alignStyle = (align: WordAlignment) =>
  `BlankAlign${align[0].toUpperCase()}${align.slice(1)}`;

// the class styleMap.ts gives the span of a marker run
export const ALIGN_CLASS = "blank-align-";

/**
 * fromWordAlignment reads a w:jc value: left for the start, justify for the
 * ways Word spreads a line, null for what Blank can't keep (numTab)
 */
export const fromWordAlignment = (
  jc: string | null | undefined,
): WordAlignment | null => {
  switch (jc) {
    case "left":
    case "start":
      return "left";
    case "center":
      return "center";
    case "right":
    case "end":
      return "right";
    case "both":
    case "distribute":
    case "lowKashida":
    case "mediumKashida":
    case "highKashida":
    case "thaiDistribute":
      return "justify";
    default:
      return null;
  }
};

const STYLES_PART = "word/styles.xml";

interface StyleAlignment {
  // the w:jc each paragraph style gives, with what its w:basedOn gives
  byStyle: Map<string, string>;
  // the paragraph style of paragraphs that name none
  defaultStyle?: string;
  // the w:jc of the document's defaults
  docDefault?: string;
}

/**
 * readStyleAlignment reads the alignment the paragraph styles of styles.xml
 * give, following w:basedOn
 */
export const readStyleAlignment = (styles: Document | null): StyleAlignment => {
  const own = new Map<string, { jc?: string; basedOn?: string }>();
  let defaultStyle: string | undefined;
  const root = styles?.documentElement;
  for (const style of root ? children(root, "style") : []) {
    if (val(style, "type") !== "paragraph") continue;
    const id = val(style, "styleId");
    if (!id) continue;
    const jc = val(child(child(style, "pPr"), "jc")) ?? undefined;
    const basedOn = val(child(style, "basedOn")) ?? undefined;
    own.set(id, { jc, basedOn });
    if (["1", "true", "on"].includes(val(style, "default") ?? "")) {
      defaultStyle = id;
    }
  }
  const resolve = (id: string, seen: Set<string>): string | undefined => {
    const style = own.get(id);
    if (!style || seen.has(id)) return undefined;
    seen.add(id);
    return style.jc ?? (style.basedOn && resolve(style.basedOn, seen));
  };
  const byStyle = new Map<string, string>();
  for (const id of own.keys()) {
    const jc = resolve(id, new Set());
    if (jc) byStyle.set(id, jc);
  }
  const defaults = root ? child(root, "docDefaults") : undefined;
  const docDefault =
    val(child(child(child(defaults, "pPrDefault"), "pPr"), "jc")) ?? undefined;
  return { byStyle, defaultStyle, docDefault };
};

// the paragraphs the other rewrites mark what mammoth would lose with, whose
// text cleanup.ts reads
const MARKER_STYLES = new Set([
  EMBED_STYLE,
  FORM_STYLE,
  PAGE_BREAK_STYLE,
  TOC_STYLE,
]);

/**
 * alignmentOf returns how the paragraph `p` is aligned: by its own w:jc, its
 * style's, the default style's or the document's defaults; null for the
 * marker paragraphs of the other rewrites
 */
const alignmentOf = (p: Element, styles: StyleAlignment) => {
  const pPr = child(p, "pPr");
  const style = val(child(pPr, "pStyle"));
  if (style && MARKER_STYLES.has(style)) return null;
  return fromWordAlignment(
    val(child(pPr, "jc")) ??
      (style
        ? styles.byStyle.get(style)
        : styles.defaultStyle && styles.byStyle.get(styles.defaultStyle)) ??
      styles.docDefault,
  );
};

/**
 * inCell tells whether the paragraph `p` is in a table's cell
 */
const inCell = (p: Element) => {
  for (let parent = p.parentElement; parent; parent = parent.parentElement) {
    if (parent.namespaceURI === W && parent.localName === "tc") return true;
  }
  return false;
};

/**
 * markerRun returns a run in the style of `align`, holding the marker
 */
const markerRun = (doc: Document, align: WordAlignment) => {
  const r = doc.createElementNS(W, "w:r");
  const rPr = r.appendChild(doc.createElementNS(W, "w:rPr"));
  rPr
    .appendChild(doc.createElementNS(W, "w:rStyle"))
    .setAttributeNS(W, "w:val", alignStyle(align));
  r.appendChild(doc.createElementNS(W, "w:t")).textContent = ALIGN_MARKER;
  return r;
};

/**
 * markAlignment puts a marker run first in every aligned paragraph of the
 * document, after its properties
 * @returns whether it marked any
 */
export const markAlignment = async (zip: JSZip): Promise<boolean> => {
  const doc = await parsePart(zip, DOCUMENT_PART);
  if (!doc) return false;
  const styles = readStyleAlignment(await parsePart(zip, STYLES_PART));
  let marked = false;
  for (const p of [...doc.getElementsByTagNameNS(W, "p")]) {
    const align = alignmentOf(p, styles);
    if (!align || (align === "left" && !inCell(p))) continue;
    const pPr = child(p, "pPr");
    p.insertBefore(markerRun(doc, align), pPr ? pPr.nextSibling : p.firstChild);
    marked = true;
  }
  if (marked) {
    zip.file(DOCUMENT_PART, new XMLSerializer().serializeToString(doc));
  }
  return marked;
};
