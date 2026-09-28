import type JSZip from "jszip";

import { matchPaper } from "../../layout/paper";
import { differences, resolveLayout } from "../../layout/resolve";
import {
  type Margins,
  type PageChanges,
  type PageSettings,
  portrait,
} from "../../layout/settings";
import { readBands } from "./bands";
import { child, isOn, parsePart, val, W } from "./xml";

// Reads the page setup of a Word document, which mammoth leaves out: the
// paper, orientation, margins, header and footer of its first section, and
// the headings that start a new page.

const DOCUMENT = "word/document.xml";
const SETTINGS = "word/settings.xml";
const STYLES = "word/styles.xml";

// Word measures pages in twentieths of a point
const points = (twips: string | null) => {
  const value = Number(twips);
  return twips !== null && Number.isFinite(value) ? value / 20 : undefined;
};

export interface WordLayout {
  // the page setup, or undefined if the document has none Blank can read
  page?: Omit<PageSettings, "size"> & {
    size: Exclude<PageSettings["size"], "auto">;
  };
  // what Blank's page setup can't hold
  warnings: string[];
}

/**
 * sections returns the section properties of the document in order: those
 * that end a section in a paragraph, then those of the last section
 */
const sections = (doc: Document) =>
  [...doc.getElementsByTagNameNS(W, "sectPr")].filter(
    (sectPr) =>
      sectPr.parentElement?.localName === "pPr" ||
      sectPr.parentElement?.localName === "body",
  );

// the paper, orientation and margins of a section
type SectionPage = Pick<
  NonNullable<WordLayout["page"]>,
  "size" | "orientation" | "margins"
>;

const readPage = (sectPr: Element): SectionPage | undefined => {
  const pgSz = child(sectPr, "pgSz");
  const pgMar = child(sectPr, "pgMar");
  const width = points(val(pgSz, "w"));
  const height = points(val(pgSz, "h"));
  if (!width || !height) return undefined;

  // top and bottom are negative for margins the text never moves into
  const margin = (side: keyof Margins) =>
    Math.abs(points(val(pgMar, side)) ?? 0);
  const orientation =
    val(pgSz, "orient") === "landscape" || width > height
      ? "landscape"
      : "portrait";
  const size = portrait(width, height);
  return {
    size: matchPaper(size.width, size.height) ?? size,
    orientation,
    margins: {
      top: margin("top"),
      right: margin("right"),
      bottom: margin("bottom"),
      left: margin("left"),
    },
  };
};

const sameSetup = (a: Element, b: Element) =>
  JSON.stringify(readPage(a)) === JSON.stringify(readPage(b));

/**
 * headingBreaks returns the levels of the heading styles that start a new
 * page, e.g. [1] for Word's "Page break before" on Heading 1
 */
const headingBreaks = (styles: Document | null) => {
  if (!styles) return [];
  const levels = new Set<number>();
  for (const style of styles.getElementsByTagNameNS(W, "style")) {
    const id = val(style, "styleId") ?? "";
    const name = val(child(style, "name")) ?? "";
    const level =
      /^heading ?([1-6])$/i.exec(id)?.[1] ??
      /^heading ([1-6])$/i.exec(name)?.[1];
    if (level && isOn(child(child(style, "pPr"), "pageBreakBefore"))) {
      levels.add(Number(level));
    }
  }
  return [...levels].sort((a, b) => a - b);
};

/**
 * readWordLayout reads the page setup of a Word document
 */
export const readWordLayout = async (zip: JSZip): Promise<WordLayout> => {
  const doc = await parsePart(zip, DOCUMENT);
  const all = doc ? sections(doc) : [];
  if (all.length === 0) return { warnings: [] };

  const [first] = all;
  const warnings: string[] = [];
  if (all.some((sectPr) => !sameSetup(sectPr, first))) {
    warnings.push(
      `the document has ${all.length} sections with different page setups, Blank used the first one`,
    );
  }
  if (points(val(child(first, "pgMar"), "gutter"))) {
    warnings.push("the binding margin was left out");
  }
  const settings = await parsePart(zip, SETTINGS);
  if (isOn(settings?.getElementsByTagNameNS(W, "mirrorMargins")[0])) {
    warnings.push("mirrored margins became the same on every page");
  }
  const page = readPage(first);
  if (!page) return { warnings };
  const { warnings: bandWarnings, ...bands } = await readBands(zip, first);
  return {
    page: {
      ...page,
      newPageBefore: headingBreaks(await parsePart(zip, STYLES)),
      ...bands,
    },
    warnings: [...warnings, ...bandWarnings],
  };
};

/**
 * pageChanges returns what to write into the frontmatter of an imported
 * document for the page setup Word has: what differs from the page its
 * frontmatter (kept by Blank's export, or none) and the user's defaults give
 * @param frontmatter the frontmatter of the imported document
 * @param page the page setup of the Word document
 * @param defaults the user's default page setup
 */
export const pageChanges = (
  frontmatter: string | null,
  page: NonNullable<WordLayout["page"]>,
  defaults: PageSettings,
): PageChanges => {
  const { settings } = resolveLayout(frontmatter, defaults);
  return Object.fromEntries(
    differences(page, settings).map((key) => [key, page[key]]),
  );
};
