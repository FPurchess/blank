import { shallowRef } from "vue";

import type { StampBook, StampKind } from "../pdf/stampModel";
import type { PdfField } from "../pdf/ipc";
import type { FoundPlace } from "../signing/labels";
import type { PdfRules } from "../signing/ipc";

// The stamps placed on the pages of PDF tabs (see .claude/rules/pdf.md,
// "Stamps"): written only through src/pdf/stampBooks.ts, stored by
// storage under `stamps:<id>`, and what makes a PDF tab unsaved.

export interface TabStamps {
  // the stamps and their undo history
  readonly book: StampBook;
  // the SHA-256 of the PDF they were placed on, null while unknown
  readonly sha256: string | null;
}

// each PDF tab's stamps, by the tab's id; a tab without any has none
export const stampBooks = shallowRef<ReadonlyMap<string, TabStamps>>(new Map());

// the stamp selected in the PDF tab shown, by its id; null for none
export const selectedStamp = shallowRef<string | null>(null);

// the stamp whose tool was chosen with the mouse, which a press on a page
// places there; null while none is being placed
export const placingStamp = shallowRef<StampKind | null>(null);

// what the PDF shown lets its signing tools place (`signing_pdf_rules`), for
// the PDF of `sha256`; null until read, and in a markdown tab
export const shownPdfRules = shallowRef<{
  readonly sha256: string;
  readonly rules: PdfRules;
} | null>(null);

// what Blank found to fill in or sign on each PDF tab's pages, by the tab's
// id: its form's fields and the places found by their labels, read in the
// background once it shows (src/pdf/placesRead.ts), for the PDF of `sha256`
export interface TabPlaces {
  readonly sha256: string;
  readonly fields: readonly PdfField[];
  readonly found: readonly FoundPlace[];
}
export const pdfPlaces = shallowRef<ReadonlyMap<string, TabPlaces>>(new Map());

// how often each page of a PDF tab was filled in anew, by `<tab>:<page>`:
// part of its bitmaps' keys, so a page draws again once its fields change
export const pageRevisions = shallowRef<ReadonlyMap<string, number>>(new Map());

// why a field of the PDF shown didn't take what was typed (its font can't
// show some of the characters), shown under it; null for none
export const fieldProblem = shallowRef<{
  readonly tab: string;
  readonly field: string;
  readonly text: string;
} | null>(null);

// the place that had the focus last in the PDF shown, by its id, which Next
// goes on from; null before any
export const lastPlace = shallowRef<string | null>(null);
