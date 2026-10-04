import { bandsOn, type DocumentFields, fieldValues, hasText } from "./bands";
import type { Layout } from "./resolve";
import { SLOTS, type Slots } from "./settings";
import { type Field, segments } from "./tokens";

// What a header or footer shows on the screen, where a placeholder that
// comes out empty would leave nothing: {author} with no author set, or
// {chapter} before the first heading 1. The pages show its name there,
// quietly, so the band can still be seen and opened; the PDF and the Word
// export print the text alone.

// the names of the placeholders, as the strips' buttons call them
export const FIELD_NAMES: Record<Field, string> = {
  page: "Page",
  pages: "Pages",
  title: "Title",
  author: "Author",
  chapter: "Chapter",
  date: "Date",
  file: "File",
};

// a run of text a slot shows, or a placeholder that comes out empty there
export type BandPart = { text: string } | { field: Field };

const escapeRegExp = (text: string) =>
  text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * chapterIn returns what {chapter} stands for in `shown`, the text of a
 * slot as the layout engine wrote in its values, or null if the slot has no
 * {chapter} or its text doesn't read as the slot's. The engine knows the
 * chapter of each page; the other values are the same for the whole
 * document.
 * @param values what the other placeholders stand for
 */
export const chapterIn = (
  template: string,
  values: Record<Field, string>,
  shown: string,
): string | null => {
  let chapters = 0;
  const pattern = segments(template)
    .map((segment) => {
      if (typeof segment === "string") return escapeRegExp(segment);
      if (segment.field !== "chapter")
        return escapeRegExp(values[segment.field]);
      // every {chapter} of the slot stands for the same text
      return chapters++ ? "\\1" : "(.*)";
    })
    .join("");
  if (!chapters) return null;
  return new RegExp(`^${pattern}$`, "s").exec(shown)?.[1] ?? null;
};

/**
 * slotParts returns what a slot shows on the screen: the text the engine
 * wrote, or, where a placeholder of it comes out empty, its text with that
 * placeholder named
 * @param template the slot as it is written, e.g. "by {author}"
 * @param values what the placeholders of the page stand for, but {chapter}
 * @param shown the slot's text on the page, as the engine expanded it
 */
export const slotParts = (
  template: string,
  values: Record<Field, string>,
  shown: string,
): BandPart[] => {
  const parsed = segments(template);
  const asText = (): BandPart[] => (shown ? [{ text: shown }] : []);
  const chapter = chapterIn(template, values, shown);
  const usesChapter = parsed.some(
    (segment) => typeof segment !== "string" && segment.field === "chapter",
  );
  // a chapter it can't tell: the text as the pages show it
  if (usesChapter && chapter === null) return asText();
  const valueOf = (field: Field) =>
    field === "chapter" ? (chapter ?? "") : values[field];
  const empty = parsed.some(
    (segment) => typeof segment !== "string" && valueOf(segment.field) === "",
  );
  if (!empty) return asText();
  const parts: BandPart[] = [];
  for (const segment of parsed) {
    const text = typeof segment === "string" ? segment : valueOf(segment.field);
    if (typeof segment !== "string" && text === "") {
      parts.push({ field: segment.field });
      continue;
    }
    const last = parts[parts.length - 1];
    if (last && "text" in last) last.text += text;
    else parts.push({ text });
  }
  return parts;
};

/**
 * pageBandParts returns what the six slots of a page's header and footer
 * show on the screen, see slotParts
 * @param page the page, counted from 0
 * @param pages how many pages there are
 * @param shown the slots' texts as the engine expanded them, see
 *   PageEngine.bands
 */
export const pageBandParts = (
  layout: Layout,
  page: number,
  pages: number,
  fields: DocumentFields,
  shown: string[],
): BandPart[][] => {
  const bands = bandsOn(layout, page + 1);
  const values = fieldValues(layout, page + 1, pages, fields);
  const of = (slots: Slots, offset: number) =>
    SLOTS.map((slot, index) =>
      slotParts(slots[slot], values, shown[offset + index] ?? ""),
    );
  return [...of(bands.header, 0), ...of(bands.footer, 3)];
};

/**
 * emptyFields returns the placeholders that come out empty in some slots,
 * each once, in the order they show
 */
export const emptyFields = (slots: BandPart[][]): Field[] => [
  ...new Set(
    slots.flatMap((parts) =>
      parts.flatMap((part) => ("field" in part ? [part.field] : [])),
    ),
  ),
];

/**
 * hasBand returns whether a page has a header or footer written, whatever
 * its placeholders come out as there, which keeps its room on the screen
 * @param page the page, counted from 1
 */
export const hasBand = (
  layout: Layout,
  page: number,
  band: "header" | "footer",
) => hasText(bandsOn(layout, page)[band]);

// why a placeholder comes out empty, for the notice when a band shows
// nothing on a page; {page}, {pages} and {date} always have a value
const WHY_EMPTY: Partial<Record<Field, (chapters: boolean) => string>> = {
  title: () => "the document has no title or heading yet",
  author: () => "no author is set",
  chapter: (chapters) =>
    chapters
      ? "no chapter heading comes before this page"
      : "the document has no chapter heading yet",
  file: () => "the document isn't saved to a file yet",
};

/**
 * emptyBandNotice returns what to tell when a header or footer comes out
 * empty on a page although something is written in it, because all its
 * placeholders have nothing to put in: which, why, and how to set the
 * author. Null when it shows something there, or has nothing written.
 * @param slots the band's three slots on the page, see pageBandParts
 * @param chapters whether the document has a heading 1 at all
 * @param pageSetup the shortcut of the page setup, e.g. "Ctrl+Alt+U"
 */
export const emptyBandNotice = (
  band: "header" | "footer",
  slots: BandPart[][],
  chapters: boolean,
  pageSetup: string,
): string | null => {
  const shows = slots.some((parts) =>
    parts.some((part) => "text" in part && part.text.trim()),
  );
  const fields = emptyFields(slots);
  if (shows || !fields.length) return null;
  const reasons = fields.flatMap((field) => {
    const why = WHY_EMPTY[field];
    return why ? [why(chapters)] : [];
  });
  const list = new Intl.ListFormat("en", { type: "conjunction" }).format(
    reasons,
  );
  const notice = `The ${band} is empty on this page: ${list}.`;
  return fields.includes("author")
    ? `${notice} Add an author under Edit as text in the page setup (${pageSetup}).`
    : notice;
};
