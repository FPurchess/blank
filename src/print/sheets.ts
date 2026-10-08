import type { Placement, PrintSheet } from "../engine/types";

// Where the pages fall on the sheets that print: the one geometry of
// printing. The engine writes the print PDF from these sheets
// (PageEngine.printPdf), and the print preview places its pages by them, so
// the preview shows what prints.

export type PerSheet = 1 | 2 | 4;
export type Scale = "actual" | "fit";

export interface Size {
  width: number;
  height: number;
}

// the room around and between pages printed several to a sheet, in points
export const NUP_GUTTER = 18;

export interface SheetPlan {
  // the pages to print, by their index, in the order they print
  pages: readonly number[];
  // the size of the document's pages
  page: Size;
  perSheet: PerSheet;
  scale: Scale;
  // the paper the system's print dialog chose, if it said; else a sheet is
  // the document's paper
  paper?: Size;
}

const isLandscape = ({ width, height }: Size) => width > height;

// `size` turned to be landscape or not
const turned = (size: Size, landscape: boolean): Size =>
  isLandscape(size) === landscape
    ? size
    : { width: size.height, height: size.width };

/**
 * printSheets lays the pages out on sheets: one per sheet at their actual
 * size or fitted to the paper, centered; two per sheet side by side on a
 * landscape sheet (above each other for landscape pages), as office suites
 * print them; four per sheet in two rows. Several to a sheet, the pages
 * shrink to their cells, left to right, then top to bottom.
 */
export const printSheets = ({
  pages,
  page,
  perSheet,
  scale,
  paper,
}: SheetPlan): PrintSheet[] => {
  const landscape = isLandscape(page);
  // two to a sheet turn it across the pages
  const sheet = turned(paper ?? page, perSheet === 2 ? !landscape : landscape);
  const columns = perSheet === 1 || (perSheet === 2 && landscape) ? 1 : 2;
  const rows = perSheet / columns;
  const gutter = perSheet === 1 ? 0 : NUP_GUTTER;
  const cell = {
    width: (sheet.width - (columns + 1) * gutter) / columns,
    height: (sheet.height - (rows + 1) * gutter) / rows,
  };
  const fits = Math.min(cell.width / page.width, cell.height / page.height);
  const k = perSheet === 1 && scale === "actual" ? 1 : fits;
  const placement = (index: number, at: number): Placement => {
    const column = at % columns;
    const row = Math.floor(at / columns);
    return {
      page: pages[index],
      x:
        gutter +
        column * (cell.width + gutter) +
        (cell.width - page.width * k) / 2,
      y:
        gutter +
        row * (cell.height + gutter) +
        (cell.height - page.height * k) / 2,
      scale: k,
    };
  };
  const sheets: PrintSheet[] = [];
  for (let first = 0; first < pages.length; first += perSheet) {
    const count = Math.min(perSheet, pages.length - first);
    sheets.push({
      ...sheet,
      placements: Array.from({ length: count }, (_, at) =>
        placement(first + at, at),
      ),
    });
  }
  return sheets;
};

// what the system's print dialog asks of a ready PDF: some of its sheets
// (0-based, inclusive ranges), and a scale in percent
export interface SystemChoices {
  ranges?: readonly (readonly [number, number])[];
  scale?: number;
}

/**
 * applySystemChoices keeps the sheets the system's dialog chose and scales
 * them as it said, since it can't be trusted to do either with a PDF
 */
export const applySystemChoices = (
  sheets: readonly PrintSheet[],
  { ranges, scale }: SystemChoices,
): PrintSheet[] => {
  const chosen = ranges?.length
    ? sheets.filter((_, index) =>
        ranges.some(([from, to]) => index >= from && index <= to),
      )
    : [...sheets];
  const k = scale && scale > 0 ? scale / 100 : 1;
  if (k === 1) return chosen;
  return chosen.map((sheet) => ({
    ...sheet,
    placements: sheet.placements.map((placement) => ({
      page: placement.page,
      x: placement.x * k,
      y: placement.y * k,
      scale: placement.scale * k,
    })),
  }));
};
