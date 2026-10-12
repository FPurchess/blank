import { shallowRef } from "vue";

import type { StampBook, StampKind } from "../pdf/stampModel";
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
