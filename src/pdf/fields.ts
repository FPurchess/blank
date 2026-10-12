import type { PdfField, PdfRect } from "./ipc";

// What the helper reads of a PDF's pages for signing it: the words and drawn
// lines of a page (the `text` op) and the fields of its form, as src/pdf/ipc.ts
// gets them. Every rect is `[x, y, width, height]` in display points, from the
// top left of the page as it shows.

export type { PageText, PdfField, PdfFieldKind } from "./ipc";

export type Rect = PdfRect;
export type PdfFieldFlags = PdfField["flags"];
// where a field shows: one of its widgets, on the page `page` (from 0)
export type PdfWidget = PdfField["widgets"][number];
