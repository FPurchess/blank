import type { NumberStyle } from "../../layout/settings";
import type { Field } from "../../layout/tokens";

// Word's names for what headers and footers show: the Word export writes
// them, and the Word import reads them back.

// the fields of the placeholders; {chapter} is STYLEREF of CHAPTER_STYLE
export const WORD_FIELDS: Record<Field, string> = {
  page: "PAGE",
  pages: "NUMPAGES",
  title: "TITLE",
  author: "AUTHOR",
  chapter: "STYLEREF",
  date: "DATE",
  file: "FILENAME",
};

// the style whose text {chapter} shows: the heading 1 of the page
export const CHAPTER_STYLE = "Heading 1";

// the page number styles
export const WORD_NUMBER_FORMATS = {
  "1": "decimal",
  i: "lowerRoman",
  I: "upperRoman",
} as const satisfies Record<NumberStyle, string>;
