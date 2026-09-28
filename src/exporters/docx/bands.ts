import type { Paragraph } from "docx";

import { type Band, type DocumentFields, hasText } from "../../layout/bands";
import type { Layout } from "../../layout/resolve";
import { type Bands, NO_BANDS, SLOTS, type Slots } from "../../layout/settings";
import { segments } from "../../layout/tokens";
import { systemLocale } from "../../layout/paper";
import { CHAPTER_STYLE, WORD_FIELDS } from "./fields";
import { STYLE } from "./template";

type Docx = typeof import("docx");

// The headers and footers of the Word export: one paragraph in Word's Header
// or Footer style, whose tab stops put the slots in the center and on the
// right, with Word's fields for the placeholders, so Word keeps them right.

/**
 * datePicture returns Word's picture of a long date in the region, e.g.
 * d MMMM yyyy for "27 September 2026", for the DATE field
 */
export const datePicture = (locale = systemLocale()) =>
  new Intl.DateTimeFormat(locale, { dateStyle: "long" })
    .formatToParts(new Date(2026, 8, 27))
    .map(({ type, value }) => {
      switch (type) {
        case "day":
          return "d";
        case "month":
          return "MMMM";
        case "year":
          return "yyyy";
        case "weekday":
          return "dddd";
        default:
          // text in the picture is quoted, like 'de'
          return /[\p{L}']/u.test(value)
            ? `'${value.replace(/'/g, "")}'`
            : value;
      }
    })
    .join("");

/**
 * bandParagraph writes the slots of a header or footer as a paragraph
 * @param width the width of the text, in twentieths of a point
 * @param fields what Word shows for its TITLE, AUTHOR, DATE and FILENAME
 *   fields until it updates them
 */
const bandParagraph = (
  docx: Docx,
  slots: Slots,
  style: string,
  width: number,
  fields: DocumentFields,
): Paragraph => {
  const { PageNumber, SimpleField, Tab, TabStopType, TextRun } = docx;
  // the slots up to the last one with text, separated by tabs
  const last = Math.max(...SLOTS.map((slot, i) => (slots[slot] ? i : 0)));
  const children = SLOTS.slice(0, last + 1).flatMap((slot, index) => [
    ...(index > 0 ? [new TextRun({ children: [new Tab()] })] : []),
    ...segments(slots[slot]).map((segment) => {
      if (typeof segment === "string") return new TextRun(segment);
      switch (segment.field) {
        case "page":
          return new TextRun({ children: [PageNumber.CURRENT] });
        case "pages":
          return new TextRun({ children: [PageNumber.TOTAL_PAGES] });
        case "title":
        case "author":
        case "file":
          return new SimpleField(
            WORD_FIELDS[segment.field],
            fields[segment.field],
          );
        // the text of the first heading 1 on the page, or else the last
        // one before it
        case "chapter":
          return new SimpleField(
            `${WORD_FIELDS.chapter} "${CHAPTER_STYLE}"`,
            "",
          );
        case "date":
          return new SimpleField(
            `${WORD_FIELDS.date} \\@ "${datePicture()}"`,
            fields.date,
          );
      }
    }),
  ]);
  return new docx.Paragraph({
    style,
    tabStops: [
      { type: TabStopType.CENTER, position: Math.round(width / 2) },
      { type: TabStopType.RIGHT, position: width },
    ],
    children,
  });
};

/**
 * bandSections returns the headers and footers of the Word document's
 * section: those of every page, of the first page, which Word calls
 * "Different first page", and of even pages, which the document turns on
 * with "Different odd and even pages". A band without text anywhere has no
 * parts; Word wants a paragraph in every part it has.
 * @param width the width of the text, in twentieths of a point
 */
export const bandSections = (
  docx: Docx,
  layout: Layout,
  width: number,
  fields: DocumentFields,
) => {
  const { firstPage, evenPages } = layout;
  // the pages with bands of their own, by Word's name for them
  const variants: [type: "default" | "first" | "even", bands: Bands][] = [
    ["default", { header: layout.header, footer: layout.footer }],
  ];
  if (firstPage !== "same") {
    variants.push(["first", firstPage === "plain" ? NO_BANDS : firstPage]);
  }
  if (evenPages) variants.push(["even", evenPages]);
  const parts = (band: Band, Part: typeof docx.Header | typeof docx.Footer) =>
    variants.some(([, bands]) => hasText(bands[band]))
      ? Object.fromEntries(
          variants.map(([type, bands]) => [
            type,
            new Part({
              children: [
                bandParagraph(docx, bands[band], STYLE[band], width, fields),
              ],
            }),
          ]),
        )
      : undefined;
  const headers = parts("header", docx.Header);
  const footers = parts("footer", docx.Footer);
  return {
    ...(headers ? { headers } : {}),
    ...(footers ? { footers } : {}),
    // kept without text, for when there is some
    ...(firstPage === "same" ? {} : { titlePage: true }),
    evenAndOddHeaderAndFooters: evenPages !== null,
  };
};
