// The page both exporters lay out on, so images and text measure the same in
// the PDF and the Word document. pdfmake measures in points.

// A4 in points
export const PAGE_WIDTH = 595.28;
export const PAGE_HEIGHT = 841.89;
export const PAGE_MARGIN = 40;

export const CONTENT_WIDTH = PAGE_WIDTH - 2 * PAGE_MARGIN;
export const CONTENT_HEIGHT = PAGE_HEIGHT - 2 * PAGE_MARGIN;

// images are measured in CSS pixels at 96 dpi, like in the editor
export const POINTS_PER_PIXEL = 0.75;
