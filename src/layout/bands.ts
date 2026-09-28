import type { Node } from "prosemirror-model";

import {
  type DocumentProperties,
  firstHeading,
  readProperties,
} from "../markdown";
import type { Layout } from "./resolve";
import { systemLocale } from "./paper";
import {
  type Bands,
  type BandSettings,
  NO_BANDS,
  type NumberStyle,
  SLOTS,
  type Slots,
} from "./settings";
import type { Field } from "./tokens";

// The headers and footers ("bands") of the PDF and the Word export alike:
// how they look, where they sit and what their placeholders stand for.

export const BAND = {
  // a step down from the body on the major third scale, like a caption
  size: 11 / 1.25,
  color: "#666666",
  // from the edge of the page to the header or footer, Word's 1.27 cm
  distance: 36,
};

// the room a band needs between the edge and the text, in points
export const BAND_ROOM = BAND.distance + BAND.size * 1.3 + 6;

// a header or a footer
export type Band = "header" | "footer";

// the page numbers the strips offer, see tokens.ts
export const NUMBER_PRESETS = [
  "{page}",
  "Page {page}",
  "{page} of {pages}",
  "Page {page} of {pages}",
];

export const hasText = (slots: Slots) => SLOTS.some((slot) => slots[slot]);

/**
 * pageNumber returns the number a page shows
 * @param page the page, counted from 1
 */
export const pageNumber = (layout: Pick<Layout, "startNumber">, page: number) =>
  page + layout.startNumber - 1;

/**
 * bandsOn returns the header and footer of a page: the first page's own or
 * none, those of even pages, or those of every page. Like in Word, a page is
 * even by the number it shows.
 * @param layout the layout of the document
 * @param page the page, counted from 1
 */
export const bandsOn = (layout: Layout, page: number): Bands => {
  if (page === 1 && layout.firstPage !== "same") {
    return layout.firstPage === "plain" ? NO_BANDS : layout.firstPage;
  }
  if (layout.evenPages && pageNumber(layout, page) % 2 === 0) {
    return layout.evenPages;
  }
  return { header: layout.header, footer: layout.footer };
};

/**
 * variantsOf returns every header and footer of a layout: those of every
 * page, and of the first and even pages when they have their own
 */
export const variantsOf = (bands: BandSettings): Bands[] => [
  { header: bands.header, footer: bands.footer },
  ...(typeof bands.firstPage === "object" ? [bands.firstPage] : []),
  ...(bands.evenPages ? [bands.evenPages] : []),
];

const ROMAN: [number, string][] = [
  [1000, "m"],
  [900, "cm"],
  [500, "d"],
  [400, "cd"],
  [100, "c"],
  [90, "xc"],
  [50, "l"],
  [40, "xl"],
  [10, "x"],
  [9, "ix"],
  [5, "v"],
  [4, "iv"],
  [1, "i"],
];

/**
 * formatNumber writes a page number in a style: 4, iv or IV. Roman
 * numerals start at 1, so 0 stays 0, as in Word.
 */
export const formatNumber = (number: number, style: NumberStyle) => {
  if (style === "1" || number < 1) return String(number);
  let rest = number;
  let roman = "";
  for (const [value, letters] of ROMAN) {
    for (; rest >= value; rest -= value) roman += letters;
  }
  return style === "I" ? roman.toUpperCase() : roman;
};

// what {title}, {author}, {date} and {file} stand for
export interface DocumentFields {
  title: string;
  author: string;
  date: string;
  file: string;
}

// the placeholders of no document, e.g. while no band shows them
export const NO_FIELDS: DocumentFields = {
  title: "",
  author: "",
  date: "",
  file: "",
};

/**
 * formatDate writes a date the long way of the region, e.g. "27 September
 * 2026" or "September 27, 2026"
 */
export const formatDate = (date: Date, locale = systemLocale()) =>
  new Intl.DateTimeFormat(locale, { dateStyle: "long" }).format(date);

/**
 * fileName returns the name of a file without its folder and extension
 */
export const fileName = (path: string | null) =>
  (path ?? "")
    .split(/[\\/]/)
    .pop()!
    .replace(/(.)\.[^.]*$/, "$1");

/**
 * fieldsOf returns what the placeholders stand for: the title and author of
 * the properties, or the first heading as the title, today's date and the
 * name of the file
 * @param firstHeading the first heading, only asked for without a title
 * @param path the document's file, null for an untitled one
 */
export const fieldsOf = (
  { title, author }: DocumentProperties,
  firstHeading: () => string,
  path: string | null,
  { now = new Date(), locale = systemLocale() } = {},
): DocumentFields => ({
  title: title ?? firstHeading(),
  author: author ?? "",
  date: formatDate(now, locale),
  file: fileName(path),
});

/**
 * sameFields checks whether two sets of placeholder values are the same
 */
export const sameFields = (a: DocumentFields, b: DocumentFields) =>
  a.title === b.title &&
  a.author === b.author &&
  a.date === b.date &&
  a.file === b.file;

/**
 * documentFields returns what the placeholders of a document stand for, see
 * fieldsOf
 */
export const documentFields = (
  doc: Node,
  path: string | null = null,
  options: { now?: Date; locale?: string } = {},
): DocumentFields =>
  fieldsOf(
    readProperties(doc.attrs.frontmatter as string | null),
    () => firstHeading(doc),
    path,
    options,
  );

// a heading 1 and the page it starts on
export interface Chapter {
  page: number;
  text: string;
}

/**
 * chapterOn returns what {chapter} stands for on a page: the first heading 1
 * on it, or else the last one before it, like Word's STYLEREF field
 * @param chapters the headings 1 in the order of the document
 */
export const chapterOn = (chapters: Chapter[], page: number) => {
  let text = "";
  for (const chapter of chapters) {
    if (chapter.page > page) break;
    text = chapter.text;
    if (chapter.page === page) break;
  }
  return text;
};

/**
 * fieldValues returns what the placeholders of a page stand for. Like Word's
 * NUMPAGES, {pages} counts every page, whatever the first number, in
 * arabic numerals.
 * @param page the page, counted from 1
 * @param pages how many pages there are
 * @param chapter the heading 1 of the page, see chapterOn
 */
export const fieldValues = (
  layout: Layout,
  page: number,
  pages: number,
  fields: DocumentFields,
  chapter = "",
): Record<Field, string> => ({
  ...fields,
  page: formatNumber(pageNumber(layout, page), layout.numberStyle),
  pages: String(pages),
  chapter,
});
