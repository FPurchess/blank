// What the helper reads of a PDF's pages for signing it: the words and drawn
// lines of a page (the `text` op), and the fields of its form (the protocol's
// `Field`, src-tauri/pdf/ipc/src/protocol.rs, as serde writes it). Every rect
// is `[x, y, width, height]` in display points, from the top left of the
// page as it shows.

export type Rect = [number, number, number, number];

// the words of a page, in reading order as MuPDF gives them, and its drawn
// thin horizontals (strokes and filled rects at least 40 pt wide and at most
// 2 pt high)
export interface PageText {
  words: { text: string; rect: Rect }[];
  rules: Rect[];
}

export type PdfFieldKind =
  "text" | "checkbox" | "radio" | "combo" | "list" | "button" | "signature";

export interface PdfFieldFlags {
  readOnly: boolean;
  required: boolean;
  multiline: boolean;
  comb: boolean;
  maxLen: number | null;
}

// where a field shows: one of its widgets, on the page `page` (from 0)
export interface PdfWidget {
  page: number;
  rect: Rect;
  // a checkbox's or radio button's state when it is on
  onValue: string | null;
}

// a field of the PDF's form, with its full name and what it inherits
export interface PdfField {
  name: string;
  kind: PdfFieldKind;
  // its `/TU`, what it is called for people
  label: string | null;
  value: string;
  // a choice's options
  options: string[];
  flags: PdfFieldFlags;
  // a signature field that holds a signature
  signed: boolean;
  // its widgets on the pages; none for one that shows nowhere
  widgets: PdfWidget[];
}
