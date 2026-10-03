// The space around blocks, in points, on the pages and in the PDF (see
// src/engine/flatten.ts) and in Word (src/exporters/docx/template.ts):
// margins that add up instead of collapsing, as the PDF had them since
// pdfmake wrote it.

// below a paragraph, above and below a heading, and above a heading that
// follows one
export const BLOCK_AFTER = 8;
export const HEADING_BEFORE = 16;
export const HEADING_AFTER = 5;
export const HEADING_AFTER_HEADING = 4;
// between list items, and before the blocks after the first in an item
export const ITEM_SPACE = 2;
