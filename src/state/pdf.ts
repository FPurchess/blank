import { shallowRef } from "vue";

import type { ViewAnchor } from "../engine/frames";
import type { PdfTabDocument } from "../pdf/document";

// The PDF tab shown, if one is (see .claude/rules/pdf.md). The tabs keep
// each PDF tab's document (src/editor/tabs.ts) and publish the shown one's
// here; the page view of PDFs (PdfView.vue) shows it and writes what it
// learns while it does, e.g. a page it couldn't draw.

// the shown tab's PDF, null in a markdown tab
export const shownPdf = shallowRef<PdfTabDocument | null>(null);

// the page at the reading line of the PDF shown (from 0), for "Page N of M";
// null while none shows
export const pdfPageInView = shallowRef<number | null>(null);

// the spot of the PDF at the top of the view, which the tab keeps when it's
// left (currentViewAnchor); null at the top
export const pdfViewAnchor = shallowRef<ViewAnchor | null>(null);

// whether the focus is in the page view of PDFs, which the editor leaves it
export const pdfViewFocused = shallowRef(false);
